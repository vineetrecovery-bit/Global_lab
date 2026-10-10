#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const shouldFix = args.has("--fix");
const includeDev = args.has("--include-dev");
const strict = args.has("--ci") || args.has("--strict");
const skipBuild = args.has("--skip-build");
const reportDir = path.resolve("security-reports");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
  });

  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function auditJson(label) {
  const auditArgs = ["audit", "--json"];
  if (!includeDev) auditArgs.push("--omit=dev");

  const result = run("npm", auditArgs, { capture: true, allowFailure: true });
  const output = result.stdout?.trim();

  if (!output) {
    console.error(result.stderr || `npm audit did not return JSON for ${label}.`);
    process.exit(result.status ?? 1);
  }

  try {
    return JSON.parse(output);
  } catch (error) {
    console.error(`Could not parse npm audit JSON for ${label}.`);
    if (result.stderr) console.error(result.stderr.trim());
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function severityCounts(audit) {
  return audit.metadata?.vulnerabilities ?? {};
}

function totalVulnerabilities(audit) {
  const counts = severityCounts(audit);
  return ["info", "low", "moderate", "high", "critical"].reduce(
    (total, severity) => total + (counts[severity] ?? 0),
    0,
  );
}

function advisoryTitles(vulnerability) {
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  return via
    .map((item) => {
      if (typeof item === "string") return item;
      return item.title || item.name || item.source;
    })
    .filter(Boolean);
}

function formatFix(fixAvailable) {
  if (fixAvailable === true) return "yes";
  if (!fixAvailable) return "no";
  const version = fixAvailable.version ? ` ${fixAvailable.version}` : "";
  const major = fixAvailable.isSemVerMajor ? " (major)" : "";
  return `${fixAvailable.name ?? "available"}${version}${major}`;
}

function markdownReport(audit, label) {
  const counts = severityCounts(audit);
  const vulnerabilities = Object.entries(audit.vulnerabilities ?? {}).sort((a, b) => {
    const order = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
    return (order[b[1].severity] ?? 0) - (order[a[1].severity] ?? 0) || a[0].localeCompare(b[0]);
  });

  const lines = [
    "# Security Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Scope: ${includeDev ? "dependencies and devDependencies" : "production dependencies only"}`,
    `Pass: ${label}`,
    "",
    "## Summary",
    "",
    `- Total: ${totalVulnerabilities(audit)}`,
    `- Critical: ${counts.critical ?? 0}`,
    `- High: ${counts.high ?? 0}`,
    `- Moderate: ${counts.moderate ?? 0}`,
    `- Low: ${counts.low ?? 0}`,
    `- Info: ${counts.info ?? 0}`,
    "",
  ];

  if (vulnerabilities.length === 0) {
    lines.push("## Result", "", "No vulnerabilities found.");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Vulnerabilities", "");
  for (const [name, vulnerability] of vulnerabilities) {
    lines.push(`### ${name}`, "");
    lines.push(`- Severity: ${vulnerability.severity}`);
    lines.push(`- Range: ${vulnerability.range ?? "n/a"}`);
    lines.push(`- Direct dependency: ${vulnerability.isDirect ? "yes" : "no"}`);
    lines.push(`- Fix available: ${formatFix(vulnerability.fixAvailable)}`);

    const titles = advisoryTitles(vulnerability);
    if (titles.length > 0) {
      lines.push(`- Advisories: ${titles.slice(0, 5).join("; ")}`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function writeReports(audit, label) {
  mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "latest-audit.json");
  const markdownPath = path.join(reportDir, "latest-audit.md");
  writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  writeFileSync(markdownPath, markdownReport(audit, label));
  console.log(`Wrote ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Wrote ${path.relative(process.cwd(), markdownPath)}`);
}

if (shouldFix) {
  console.log("Running npm audit fix --package-lock-only...");
  const fixArgs = ["audit", "fix", "--package-lock-only"];
  if (includeDev) fixArgs.push("--include=dev");
  run("npm", fixArgs);

  console.log("Syncing node_modules from package-lock.json...");
  run("npm", ["install"]);

  if (!skipBuild) {
    console.log("Verifying production build...");
    run("npm", ["run", "build:app"]);
  }
}

const audit = auditJson(shouldFix ? "after fix" : "audit");
writeReports(audit, shouldFix ? "after fix" : "audit");

const remaining = totalVulnerabilities(audit);
if (remaining === 0) {
  console.log("Security audit clean: found 0 vulnerabilities.");
} else {
  console.log(`Security audit found ${remaining} vulnerabilities. See security-reports/latest-audit.md.`);
}

if (strict && remaining > 0) {
  process.exit(1);
}
