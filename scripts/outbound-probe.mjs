// 第三方登录出站连通性自检。
// 用法：node scripts/outbound-probe.mjs
// 退出码 0 表示 GitHub / Microsoft 均可访问，非 0 表示至少一个不可达。
const targets = [
  ['GitHub API', 'https://api.github.com/'],
  ['GitHub OAuth', 'https://github.com/login/oauth/access_token'],
  ['Microsoft 登录', 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration']
];

let failed = 0;
for (const [label, url] of targets) {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
    console.log(`  [ok]   ${label} HTTP ${response.status} ${Date.now() - started}ms`);
  } catch (error) {
    failed += 1;
    console.log(`  [fail] ${label} ${error && error.message ? error.message : error}`);
  }
}

if (failed > 0) {
  console.log('');
  console.log('  第三方登录当前不可用。');
  console.log('  若错误包含 certificate，说明本机存在代理 / 内网穿透的根证书，');
  console.log('  请确认启动脚本设置了 NODE_USE_SYSTEM_CA=1。');
  process.exit(1);
}
