// Silence routine production console output while preserving argument effects.
// The on-device diagnostic ring and console warnings/errors remain available.
const nodePath = require("node:path");
const repoRoot = nodePath.resolve(__dirname, "../..");

module.exports = ({ types: t }) => ({
  name: "weaselplex-release-console",
  pre(file) {
    const filename = file.opts.filename;
    const relative = filename ? nodePath.relative(repoRoot, filename) : "";
    this.stripRoutineConsole =
      !!relative &&
      !relative.startsWith("..") &&
      !nodePath.isAbsolute(relative) &&
      !relative.split(nodePath.sep).includes("node_modules") &&
      !relative.replaceAll("\\", "/").startsWith("utils/jellyseerr/");
  },
  visitor: {
    CallExpression(path, state) {
      if (!state.stripRoutineConsole) return;
      const callee = path.node.callee;
      if (
        !t.isMemberExpression(callee) ||
        callee.computed ||
        !t.isIdentifier(callee.object, { name: "console" }) ||
        !t.isIdentifier(callee.property) ||
        !["log", "info", "debug"].includes(callee.property.name) ||
        path.scope.getBinding("console")
      )
        return;
      path.replaceWith(
        t.callExpression(
          t.arrowFunctionExpression([], t.blockStatement([])),
          path.node.arguments,
        ),
      );
    },
  },
});
