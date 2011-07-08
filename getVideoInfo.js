var express = require('express');
var http = require('http');
var app = express.createServer();
var querystring = require('querystring');

app.configure(function() {
  app.use(express.methodOverride());
  app.use(express.bodyParser());
});

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

app.get('/video/:id', getVideoInfo);

function getVideoInfo(req, res, next) {
  var videoId = req.params.id;
  if (!videoId) {
    next('Invalid YouTube Video ID.');
  }
  var options = {
    host: 'www.youtube.com',
    port: 80,
    path: '/get_video_info?video_id=' + videoId + '&html5=1&eurl=unknown&el=embedded&hl=en_US',
    headers: {
      'accept': '*/*',
      'accept-charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.3',
      'accept-encoding': 'gzip,deflate,sdch',
      'accept-language': 'en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2',
      'connection': 'keep-alive',
      'referer': 'http://www.youtube.com/embed/dP15zlyra3c?html5=1',
      'user-agent': 'Mozilla/5.0 (iPhone; U; CPU iPhone OS 4_1 like Mac OS X; en-us) AppleWebKit/532.9 (KHTML, like Gecko) Version/4.0.5 Mobile/8B117 Safari/6531.22.7'
    }
  };

  http.get(options, function(videoRes) {
    var videoInfo = '';
    videoRes.on('data', function(chunk) {
      videoInfo += chunk; 
    });
    videoRes.on('end', function() {
      var parts = videoInfo.split(/&/);
      for (var i = 0, len = parts.length; i < len; i++) {
        var part = parts[i];
        var keyValues = part.split(/=/);
        if (keyValues[0] === 'html5_fmt_map') {
          videoInfo = decodeURIComponent(keyValues[1]).replace(/\+/g, ' ');
          videoInfo = videoInfo.replace(/^\[/, '').replace(/\]$/, '');
          break;
        }
      }
      parts = videoInfo.split(/\},/);
      var json = '[{';
      for (var i = 0, len1 = parts.length; i < len1; i++) {
        if (i < len1 - 1) {
          parts[i] += '}';
        }
        var part = parts[i].replace(/^\{/, '').replace(/\}$/, '');
        var keyValues = part.split(/'\,/);
        for (var j = 0, len2 = keyValues.length; j < len2; j++) {        
          var keyValue = keyValues[j].split(/':/);
          json += j > 0? ',' : '';
          json += keyValue[0].replace(/\s*'/g, '"') + '":' +
              keyValue[1].replace(/^\s*'/, '"').replace(/="/g, '=\\"')
              .replace(/"$/g, '\\"');
          json += keyValue[0] !== ' \'itag'? '"' : '';
        }
        json += i < len1 - 1? '},' : '}';
      }
      json += ']';
      res.header('Content-Type', 'application/json');
      res.header('Access-Control-Allow-Origin', '*');      
      res.send(json);
    });
  });
}

app.error(function(err, req, res, next) {
  res.send(err);
});

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);