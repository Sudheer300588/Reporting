import https from "https";
import prisma from "../../../prisma/client.js";

export async function callVicidial(functionOrParams, params = {}) {
    // Support two calling styles:
    // 1) callVicidial("function_name", { user, pass, ... })
    // 2) callVicidial({ function: "function_name", user, pass, ... })
    let fn = "";
    let p = {};

    if (typeof functionOrParams === "string") {
        fn = functionOrParams;
        p = params || {};
    } else if (typeof functionOrParams === "object") {
        p = functionOrParams || {};
        fn = p.function || "";
    } else {
        throw new Error("Invalid arguments to callVicidial");
    }

    // Fetch credentials from database if not provided in params
    let user = p.user;
    let pass = p.pass;
    let vicidialUrl = p.vicidialUrl;

    if (!user || !pass || !vicidialUrl) {
        const credentials = await prisma.vicidialCredential.findFirst({
            orderBy: { createdAt: 'desc' }
        });

        if (!credentials) {
            throw new Error("No Vicidial credentials found. Please configure them in Settings.");
        }

        user = user || credentials.username;
        pass = pass || credentials.password;
        vicidialUrl = vicidialUrl || credentials.url;
    }

    // Validate credentials
    if (!user || !pass || !vicidialUrl) {
        throw new Error(`Missing Vicidial credentials: url=${!!vicidialUrl}, user=${!!user}, pass=${!!pass}`);
    }

    // Normalize URL - ensure it doesn't have trailing slash and has protocol
    vicidialUrl = vicidialUrl.trim();
    if (!vicidialUrl.startsWith('http://') && !vicidialUrl.startsWith('https://')) {
        vicidialUrl = 'https://' + vicidialUrl;
    }
    vicidialUrl = vicidialUrl.replace(/\/$/, ''); // Remove trailing slash

    return new Promise((resolve, reject) => {

        // Build query object, exclude any duplicate keys from params
        const queryObj = {
            source: "node-api",
            user,
            pass,
            function: fn || p.function || "",
        };

        for (const k of Object.keys(p)) {
            if (k === "user" || k === "pass" || k === "function" || k === "vicidialUrl") continue;
            queryObj[k] = p[k];
        }

        // validate function present
        if (!queryObj.function) return reject(new Error("callVicidial: no function specified"));

        const query = new URLSearchParams(queryObj);

        const url = `${vicidialUrl}?${query.toString()}`;
        
        // Log URL for debugging (mask credentials)
        const maskedUrl = url.replace(/user=[^&]+/, 'user=***').replace(/pass=[^&]+/, 'pass=***');
        console.log(`🔗 Calling VICIdial API: ${maskedUrl}`);


        https.get(url, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                // Handle expected "no data" responses gracefully
                if (typeof data === 'string' && data.startsWith("ERROR")) {
                    const errorMsg = data.trim();
                    
                    // These are normal "no data" scenarios, not actual errors
                    if (errorMsg.includes('NO RECORDS FOUND') || 
                        errorMsg.includes('NO LOGGED IN AGENTS')) {
                        // Return empty string so parsePipeData returns null/empty
                        return resolve('');
                    }
                    
                    // Only reject on actual API errors
                    console.error('VICIdial API error:', errorMsg);
                    return reject(new Error(errorMsg));
                }
                resolve(data);
            });
        }).on("error", err => reject(err));
    });
}

