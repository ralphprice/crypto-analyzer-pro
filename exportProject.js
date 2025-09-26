const fs = require('fs');
const path = require('path');

function exportProject(rootPath = '.') {
    let output = 'Project Structure:\n';
    let fileContents = '\n\nFile Contents:\n';

    // Directories to exclude (including nested paths)
    const excludePatterns = ['node_modules', '.next', 'dist', 'build', '__tests__', 'coverage', '.git', 'chunks', 'static', 'venv', 'cache', 'media', 'var', 'etc', 'public'];
    // Only include app.py for .py, other extensions as specified
    const includeExtensions = /\.(py|js|ts|tsx|json|csv|md|txt|yml|yaml|sql)$/i;
    const maxFileSize = 1024 * 1024; // 1MB limit per file

    // Function to build folder structure (recursive, skip excluded)
    function buildStructure(dir, indent = '') {
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                const relativePath = path.relative(rootPath, fullPath);
                if (excludePatterns.some(p => relativePath.includes(p))) continue;
                if (file.isDirectory()) {
                    output += `${indent}📁 ${relativePath || '.'}\n`;
                    buildStructure(fullPath, indent + '  ');
                } else {
                    output += `${indent}📄 ${relativePath}\n`;
                }
            }
        } catch (err) {
            console.error(`Error reading directory ${dir}:`, err.message);
        }
    }

    buildStructure(rootPath);

    // Function to append file contents (recursive, filtered)
    function appendContents(dir) {
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                const relativePath = path.relative(rootPath, fullPath);
                if (excludePatterns.some(p => relativePath.includes(p))) continue;
                if (file.isDirectory()) {
                    appendContents(fullPath);
                } else if (includeExtensions.test(relativePath)) {
                    // Only include app.py for .py files
                    if (relativePath.endsWith('.py') && relativePath !== 'analysis/app.py') continue;
                    if (relativePath.endsWith('.env')) continue; // Skip sensitive files
                    try {
                        const stats = fs.statSync(fullPath);
                        if (stats.size > maxFileSize) {
                            console.log(`Skipped large file: ${relativePath}`);
                            continue;
                        }
                        const content = fs.readFileSync(fullPath, 'utf8');
                        fileContents += `\n// File: ${relativePath}\n${content}\n`;
                        console.log(`Added: ${relativePath}`);
                    } catch (err) {
                        console.error(`Error reading file ${fullPath}:`, err.message);
                    }
                }
            }
        } catch (err) {
            console.error(`Error reading directory ${dir}:`, err.message);
        }
    }

    appendContents(rootPath);
    const fullOutput = output + fileContents;

    const outputFile = path.join(rootPath, 'all_code.txt');
    try {
        fs.writeFileSync(outputFile, fullOutput, 'utf8');
        console.log(`Project exported to ${outputFile}`);
    } catch (err) {
        console.error(`Error writing to ${outputFile}:`, err.message);
    }
}

exportProject();
