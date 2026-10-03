// Silence routine production console output while preserving argument effects.
// The on-device diagnostic ring and console warnings/errors remain available.
module.exports = ({ types: t }) => ({
  name: "weaselplex-release-console",
  visitor: {
    CallExpression(path) {
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
