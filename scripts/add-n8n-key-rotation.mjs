import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const filenames = [
  "wf-02-manual-intake.json",
  "wf-03-normalize.json",
  "wf-04-cluster-score.json",
  "wf-05-research.json",
  "wf-06-angle-post-generation.json",
  "wf-07-post-verification.json",
  "wf-08-image-generation.json",
  "wf-09-content-actions.json",
];
const secretDeclaration = "const secret = $env.WORKFLOW_HMAC_SECRET;";
const expectedBlock =
  "const expected = `sha256=${crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')}`;\n" +
  "if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new Error('Workflow signature is invalid');";
const rotationDeclaration =
  "const secret = $env.WORKFLOW_HMAC_SECRET;\n" +
  "const previousSecret = $env.WORKFLOW_HMAC_PREVIOUS_SECRET;";
const rotatingVerification =
  "const authentic = [secret, previousSecret].filter(Boolean).some((candidate) => {\n" +
  "  const expected = `sha256=${crypto.createHmac('sha256', candidate).update(canonical, 'utf8').digest('hex')}`;\n" +
  "  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));\n" +
  "});\n" +
  "if (!authentic) throw new Error('Workflow signature is invalid');";

for (const filename of filenames) {
  const path = resolve(root, "n8n", "workflows", filename);
  const workflow = JSON.parse(await readFile(path, "utf8"));
  const verificationNodes = workflow.nodes.filter(
    (node) =>
      node.type === "n8n-nodes-base.code" &&
      typeof node.parameters?.jsCode === "string" &&
      node.parameters.jsCode.includes(expectedBlock),
  );
  if (verificationNodes.length !== 1) {
    throw new Error(`${filename} must contain exactly one rotatable verification node.`);
  }
  const node = verificationNodes[0];
  node.parameters.jsCode = node.parameters.jsCode
    .replace(secretDeclaration, rotationDeclaration)
    .replace(expectedBlock, rotatingVerification);
  await writeFile(path, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
}
