const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  globalIgnores(["dist/*", "android/*", "ios/*"]),
  expoConfig,
  {
    rules: {
      // The app intentionally uses refs as revision tokens around asynchronous
      // network and clipboard work. React Compiler is not enabled for this app.
      "react-hooks/refs": "off",
      // Modal draft state is synchronized when a different record is opened.
      "react-hooks/set-state-in-effect": "off"
    }
  }
]);
