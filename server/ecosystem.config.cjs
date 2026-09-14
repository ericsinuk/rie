module.exports = {
  apps: [{
    name: 'rie-server',
    script: 'index.js',
    cwd: '/var/www/dhl-audit/rie/server',
    env: {
      NODE_ENV: 'production',
      PORT: 5555
    }
  }]
}
