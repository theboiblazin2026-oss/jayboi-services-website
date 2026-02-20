const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = '.';
const TARGET_SCRIPT = 'js/contact_form_handler.js';

// Get all HTML files
function getHtmlFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (file !== 'node_modules' && file !== 'functions' && file !== '.git') {
                results = results.concat(getHtmlFiles(filePath));
            }
        } else if (file.endsWith('.html')) {
            results.push(filePath);
        }
    });
    return results;
}

// Audit a single file
function auditFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    // SEO Checks
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'MISSING';

    const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const description = descMatch ? descMatch[1].trim() : 'MISSING';

    const h1Match = content.match(/<h1.*?>(.*?)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].trim().replace(/<[^>]*>/g, '') : 'MISSING'; // Strip inner tags

    // Integration Check
    const hasScript = content.includes(TARGET_SCRIPT);

    // Link Check (Basic) - Find internal .html links
    const linkMatches = content.matchAll(/href=["'](.*?)["']/g);
    const brokenLinks = [];
    for (const match of linkMatches) {
        const href = match[1];
        if (href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

        // internal file check
        const cleanHref = href.split('?')[0].split('#')[0];
        const linkPath = path.resolve(path.dirname(filePath), cleanHref);

        try {
            if (!fs.existsSync(linkPath)) {
                brokenLinks.push(href);
            }
        } catch (e) {
            // ignore
        }
    }

    return {
        file: fileName,
        path: filePath,
        title,
        description,
        h1,
        hasScript,
        brokenLinks
    };
}

// Run Audit
const files = getHtmlFiles(ROOT_DIR);
console.log(`Scanning ${files.length} HTML files...\n`);

console.log('| File | Script Injected? | Title | H1 | Description | Issues |');
console.log('|---|---|---|---|---|---|');

files.forEach(f => {
    const res = auditFile(f);

    // Check constraints
    const titleStatus = res.title === 'MISSING' ? '❌' : (res.title.length < 10 ? '⚠️ Short' : '✅');
    const h1Status = res.h1 === 'MISSING' ? '❌' : '✅';
    const descStatus = res.description === 'MISSING' ? '❌' : (res.description.length < 50 ? '⚠️ Short' : '✅');
    const scriptStatus = res.hasScript ? '✅' : '⚪️'; // White circle if missing (maybe intentional for non-form pages)

    let issues = [];
    if (res.title === 'MISSING') issues.push('Missing Title');
    if (res.h1 === 'MISSING') issues.push('Missing H1');
    if (res.description === 'MISSING') issues.push('Missing Meta Desc');
    if (res.brokenLinks.length > 0) issues.push(`${res.brokenLinks.length} Broken Links`);

    const issueStr = issues.length > 0 ? `**${issues.join(', ')}**` : 'Pass';

    console.log(`| [${res.file}](${res.path}) | ${scriptStatus} | ${titleStatus} | ${h1Status} | ${descStatus} | ${issueStr} |`);
});
