module.exports = {
  apps: [{
    name: 'rie-server',
    script: 'index.js',
    cwd: '/var/www/rie/server',
    env: {
      NODE_ENV: 'production',
      PORT: 5555
    }
  }]
}
