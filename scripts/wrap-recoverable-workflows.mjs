import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const definitions = [
  ["wf-05-research.json", "WF-05 Research", "research"],
  ["wf-06-angle-post-generation.json", "WF-06 Angle and Post Generation", "editorial_generation"],
  ["wf-07-post-verification.json", "WF-07 Post Verification", "post_verification"],
  ["wf-08-image-generation.json", "WF-08 Image Generation", "image_generation"],
  [
    "wf-09-content-actions.json",
    "WF-09 Content Actions",
    "isImageAction ? 'image_generation' : 'content_action'",
    "outbound",
  ],
];

for (const [filename, workflowName, target, requestPayload = "payload"] of definitions) {
  const path = resolve(root, "n8n", "workflows", filename);
  const workflow = JSON.parse(await readFile(path, "utf8"));
  const codeNode = workflow.nodes.find((node) => node.type === "n8n-nodes-base.code");
  const requestNode = workflow.nodes.find((node) => node.type === "n8n-nodes-base.httpRequest");
  if (!codeNode || !requestNode) throw new Error(`${filename} has no recoverable request pair.`);
  const marker = "const targetPath = ";
  const prefix = codeNode.parameters.jsCode.slice(
    0,
    codeNode.parameters.jsCode.lastIndexOf(marker),
  );
  if (!prefix) throw new Error(`${filename} does not contain the expected signing boundary.`);
  codeNode.parameters.jsCode =
    prefix +
    `const targetPath = '/api/internal/workflows/recovery/execute';\n` +
    `const recoveryPayload = {\n` +
    `  contractVersion: '1.0',\n` +
    `  workflowExecutionId: String($execution.id),\n` +
    `  workflowName: '${workflowName}',\n` +
    `  target: ${target.includes("?") ? target : `'${target}'`},\n` +
    `  requestPayload: ${requestPayload},\n` +
    `};\n` +
    `const recoveryBody = JSON.stringify(recoveryPayload);\n` +
    `const nextTimestamp = String(Math.floor(Date.now() / 1000));\n` +
    `const nextNonce = crypto.randomUUID();\n` +
    `const nextDigest = crypto.createHash('sha256').update(recoveryBody, 'utf8').digest('hex');\n` +
    `const nextCanonical = [nextTimestamp, nextNonce, 'POST', targetPath, nextDigest].join('\\n');\n` +
    `const signature = \`sha256=\${crypto.createHmac('sha256', secret).update(nextCanonical, 'utf8').digest('hex')}\`;\n` +
    `return [{ json: { body: recoveryBody, nonce: nextNonce, signature, timestamp: nextTimestamp, url: \`\${$env.APP_BASE_URL}\${targetPath}\` } }];`;
  requestNode.parameters.options = {
    ...requestNode.parameters.options,
    timeout: 200000,
  };
  await writeFile(path, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
}
