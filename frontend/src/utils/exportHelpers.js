import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Table, TableRow, TableCell, Paragraph, BorderStyle } from 'docx';

/**
 * Convert array to CSV string
 */
const convertToCSV = (data, columns) => {
    if (!data || data.length === 0) return '';

    // Get headers
    const headers = Object.values(columns);
    const keys = Object.keys(columns);

    // Build CSV
    let csv = headers.join(',') + '\n';

    data.forEach(row => {
        const values = keys.map(key => {
            let value = getNestedValue(row, key);

            // Handle special cases
            if (value instanceof Date) {
                value = value.toISOString().split('T')[0];
            } else if (typeof value === 'number') {
                value = value.toString();
            } else if (typeof value === 'boolean') {
                value = value ? 'Yes' : 'No';
            } else if (value === null || value === undefined) {
                value = '';
            } else {
                value = String(value);
            }

            // Escape quotes and wrap in quotes if contains comma
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }

            return value;
        });

        csv += values.join(',') + '\n';
    });

    return csv;
};

/**
 * Get nested object value by dot notation path
 */
const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
};

/**
 * Download file helper
 */
const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

/**
 * Download blob file helper
 */
const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

/**
 * Export data to CSV
 */
export const exportToCSV = (data, filename, columns) => {
    const csv = convertToCSV(data, columns);
    downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
};

/**
 * Export data to Excel
 */
export const exportToExcel = (data, filename, columns, sheetName = 'Data') => {
    // Transform data with selected columns
    const transformedData = data.map(row => {
        const newRow = {};
        Object.entries(columns).forEach(([key, header]) => {
            let value = getNestedValue(row, key);

            // Handle dates
            if (value instanceof Date) {
                value = value.toISOString().split('T')[0];
            }

            newRow[header] = value || '';
        });
        return newRow;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet(transformedData);

    // Auto-width columns
    const colWidths = Object.values(columns).map(header => ({
        wch: Math.min(Math.max(header.length + 2, 12), 50)
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

/**
 * Export data to PDF
 */
export const exportToPDF = (data, filename, title, columns) => {
    try {
        const doc = new jsPDF({
            orientation: data.length > 5 ? 'landscape' : 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;

        // Add title
        doc.setFontSize(14);
        doc.text(title, margin, margin + 5);

        // Add timestamp
        doc.setFontSize(10);
        doc.setTextColor(128);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, margin + 12);

        // Reset text color
        doc.setTextColor(0);

        // Prepare table data
        const headers = Object.values(columns);
        const keys = Object.keys(columns);

        const tableData = [headers];
        data.forEach(row => {
            const rowData = keys.map(key => {
                let value = getNestedValue(row, key);

                if (value instanceof Date) {
                    value = value.toISOString().split('T')[0];
                } else if (typeof value === 'number') {
                    value = value.toLocaleString();
                } else if (typeof value === 'boolean') {
                    value = value ? 'Yes' : 'No';
                } else if (value === null || value === undefined) {
                    value = '';
                }

                return String(value);
            });
            tableData.push(rowData);
        });

        // Add table
        autoTable(doc, {
            startY: margin + 15,
            head: [tableData[0]],
            body: tableData.slice(1),
            margin: margin,
            styles: {
                fontSize: 9,
                cellPadding: 3,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [41, 128, 185],
                textColor: 255,
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            },
            didDrawPage: (data) => {
                doc.setFontSize(9);
                doc.setTextColor(128);
                const pageCount = doc.internal.pages.length - 1;
                doc.text(
                    `Page ${data.pageNumber} of ${pageCount}`,
                    pageWidth / 2,
                    pageHeight - 10,
                    { align: 'center' }
                );
            }
        });

        doc.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error('Failed to generate PDF: ' + error.message);
    }
};

/**
 * Export data to Word document
 */
export const exportToWord = async (data, filename, title, columns) => {
    try {
        const keys = Object.keys(columns);
        const headers = Object.values(columns);

        // Create table rows
        const tableRows = [
            new TableRow({
                children: headers.map(header =>
                    new TableCell({
                        children: [new Paragraph(header)],
                        shading: {
                            fill: '2980B9',
                            val: 'clear'
                        },
                        margins: { top: 100, bottom: 100, left: 100, right: 100 }
                    })
                )
            })
        ];

        // Add data rows
        data.forEach((row, index) => {
            const cells = keys.map(key => {
                let value = getNestedValue(row, key);

                if (value instanceof Date) {
                    value = value.toISOString().split('T')[0];
                } else if (typeof value === 'number') {
                    value = value.toLocaleString();
                } else if (typeof value === 'boolean') {
                    value = value ? 'Yes' : 'No';
                } else if (value === null || value === undefined) {
                    value = '';
                }

                return new TableCell({
                    children: [new Paragraph(String(value))],
                    shading: {
                        fill: index % 2 === 0 ? 'FFFFFF' : 'F5F5F5',
                        val: 'clear'
                    },
                    margins: { top: 100, bottom: 100, left: 100, right: 100 }
                });
            });

            tableRows.push(
                new TableRow({
                    children: cells
                })
            );
        });

        const doc = new Document({
            sections: [
                {
                    children: [
                        new Paragraph({
                            text: title,
                            size: 28,
                            bold: true,
                            spacing: { after: 200 }
                        }),
                        new Paragraph({
                            text: `Generated on: ${new Date().toLocaleString()}`,
                            size: 20,
                            color: '808080',
                            spacing: { after: 400 }
                        }),
                        new Table({
                            width: {
                                size: 100,
                                type: 'percentage'
                            },
                            borders: {
                                top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                                bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                                left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                                right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                                insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                                insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
                            },
                            rows: tableRows
                        })
                    ]
                }
            ]
        });

        const blob = await Packer.toBlob(doc);
        downloadBlob(blob, `${filename}.docx`);
    } catch (error) {
        console.error('Error generating Word document:', error);
        throw new Error('Failed to generate Word document: ' + error.message);
    }
};

/**
 * Export generic data with format selection
 */
export const exportData = async (data, filename, title, columns, format) => {
    try {
        switch (format.toLowerCase()) {
            case 'csv':
                exportToCSV(data, filename, columns);
                break;
            case 'excel':
            case 'xlsx':
                exportToExcel(data, filename, columns);
                break;
            case 'pdf':
                exportToPDF(data, filename, title, columns);
                break;
            case 'word':
            case 'docx':
                await exportToWord(data, filename, title, columns);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    } catch (error) {
        console.error('Export error:', error);
        throw error;
    }
};

/**
 * Get file size formatted as readable string
 */
export const getFormattedFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};
