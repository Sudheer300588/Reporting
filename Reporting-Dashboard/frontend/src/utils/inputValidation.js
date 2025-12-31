export const signupInputValidation = (formData) => {
    let { name, email, password, confirmPassword } = formData;
    let error = null;

    if (name.length < 3) {
        return error = 'Name must have at least 3 characters';
    }

    if (!name.trim()) {
        return error = 'Full name is required';
    }

    if (
        !email ||
        !email.includes('@') ||
        email.startsWith('@') ||
        email.endsWith('@') ||
        email.split('@').length !== 2 ||
        !email.split('@')[1].includes('.') ||
        email.startsWith('.') ||
        email.endsWith('.')
    ) {
        return error = 'Please enter a valid email address';
    }

    if (password.length < 6) {
        return error = 'Passwords must have at least 6 characters';
    }

    if (password !== confirmPassword) {
        return error = 'Passwords do not match';
    }

    return error;
};

export const loginInputValidation = (formData) => {
    let { email, password } = formData;
    let error = null;

    if (
        !email ||
        !email.includes('@') ||
        email.startsWith('@') ||
        email.endsWith('@') ||
        email.split('@').length !== 2 ||
        !email.split('@')[1].includes('.') ||
        email.startsWith('.') ||
        email.endsWith('.')
    ) {
        return error = 'Please enter a valid email address';
    }

    if (password.length < 6) {
        return error = 'Passwords must have at least 6 characters';
    }

    return error;
};