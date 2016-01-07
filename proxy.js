var httpProxy = require('http-proxy');
var http = require('http');
var sticky = require('sticky-session');

var first = true;
var target = 'http://localhost:8000';

var proxy = new httpProxy.createProxyServer({});

var server = http.createServer(function (req, res) {
  proxy.web(req, res, { target: target }, function(err) {
    console.log(err);
  });
});

server.on('upgrade', function (req, socket, head) {
  target = first ? 'http://localhost:8000' : 'http://localhost:8001';
  first = !first;
  proxy.ws(req, socket, head, { target: target }, function(err) {
    console.log(err);
  });
});

sticky.listen(server, 80);
