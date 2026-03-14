import fs from 'node:fs';

const sourcePath = 'frontend/src/features/trackflow/TrackFlow.jsx';
const cssPath = 'frontend/src/features/trackflow/trackflow.css';

const source = fs.readFileSync(sourcePath, 'utf8');
const blockStart = source.indexOf('const CSS = `');
if (blockStart === -1) {
  throw new Error('No se encontro "const CSS = `" en TrackFlow.jsx');
}

const cssStart = blockStart + 'const CSS = `'.length;
const cssEnd = source.indexOf('`;', cssStart);
if (cssEnd === -1) {
  throw new Error('No se encontro el final del template literal CSS (`;)');
}

const cssContent = `${source.slice(cssStart, cssEnd)}\n`;
fs.writeFileSync(cssPath, cssContent);

let nextSource = source.slice(0, blockStart) + source.slice(cssEnd + 2);

if (!nextSource.includes("import './trackflow.css';")) {
  const importAnchor = '} from "../../lib/storageClient.js";';
  nextSource = nextSource.replace(
    importAnchor,
    `${importAnchor}\n\nimport './trackflow.css';`
  );
}

nextSource = nextSource.replace(/\s*<style>\{CSS\}<\/style>\s*/g, '\n');

fs.writeFileSync(sourcePath, nextSource);
