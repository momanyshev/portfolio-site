const { withInfoPlist } = require("expo/config-plugins");

function withLocalHttp(config) {
  return withInfoPlist(config, (result) => {
    result.modResults.NSAppTransportSecurity = {
      ...(result.modResults.NSAppTransportSecurity || {}),
      NSAllowsLocalNetworking: true
    };
    result.modResults.NSLocalNetworkUsageDescription =
      "Приложению нужен доступ к локальной сети для подключения к API QA Lab на компьютере разработчика.";
    return result;
  });
}

module.exports = withLocalHttp;
