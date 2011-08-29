var http = require('http');
var https = require('https');
var querystring = require('querystring');

var express = require('express');
var app = express.createServer();

app.configure(function(){
  app.use(express.methodOverride());
});

app.configure('development', function(){
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

var GLOBAL_requests = {};

var GLOBAL_config = {
  MOBYPICTURE_KEY: 'TGoRMvQMAzWL2e9t',
  FLICKR_SECRET: 'a4a150addb7d59f1',
  FLICKR_KEY: 'b0f2a04baa5dd667fb181701408db162',
  YFROG_KEY: '89ABGHIX5300cc8f06b447103e19a201c7599962',
  INSTAGRAM_KEY: '82fe3d0649e04c2da8e38736547f9170',
  INSTAGRAM_SECRET: '4cf97de2075c4c8fbebdde57c5f9705a'
};

app.get(/^\/search\/(.+)\/(.+)$/, search);

function search(req, res, next) {
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));  

  var services = {    
    facebook: function(requestId) {      
      var currentService = 'facebook';         
      var params = {
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'graph.facebook.com',
        port: 443,
        path: '/search?' + params + '&type=post',
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http:/facebook.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
          "X-Requested-With": "XMLHttpRequest"
        } 
      };
      https.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var output = {
            result: response,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });
    },
    twitter: function(requestId) {
      var currentService = 'twitter';         
      var params = {
        q: query + ' AND ' + '(yfrog.com OR instagr.am OR flic.kr OR moby.to OR youtu.be OR twitpic.com)'
      };
      params = querystring.stringify(params);
      var options = {
        host: 'search.twitter.com',
        port: 80,
        path: '/search.json?' + params,
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http:/twitter.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
          "X-Requested-With": "XMLHttpRequest"
        } 
      };
      http.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var output = {
            result: response,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });                       
    },
    instagram: function(requestId) {
      var currentService = 'instagram';         
      var params = {
        client_id: GLOBAL_config.INSTAGRAM_KEY
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/tags/' +
            query.replace(/\s*/g, '').toLowerCase() +
            '/media/recent?' + params,
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http://instagram.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
          "X-Requested-With": "XMLHttpRequest"
        } 
      };
      https.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var output = {
            result: response,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });                       
    },    
    youtube: function(requestId) {
      var currentService = 'youtube';         
      var params = {
        v: 2,
        format: 5,
        safeSearch: 'none',
        q: query,
        alt: 'jsonc',
        'max-results': 10,
        'start-index': 1,
        time: 'this_week'        
      };
      params = querystring.stringify(params);
      var options = {
        host: 'gdata.youtube.com',
        port: 80,
        path: '/feeds/api/videos?' + params,
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http://youtube.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
          "X-Requested-With": "XMLHttpRequest"
        } 
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          //sendResults(response, currentService, requestId);
          var results = [];
          if (response.data && response.data.items) {
            var items = response.data.items;
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              results.push({
                url: item.player.default,
                message: item.title + ' - ' + item.description,
                user: 'http://www.youtube.com/' + item.uploader,
                type: 'video'
              });
            }
          }
          var output = {
            result: results,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });                       
    },
    flickrvideos: function(requestId) {
      services.flickr(requestId, true);
    },
    flickr: function(requestId, videoSearch) {     
      var currentService = 'flickr';         
      var now = new Date().getTime();
      var sixDays = 86400000 * 6;
      var params = {
        method: 'flickr.photos.search',
        api_key: GLOBAL_config.FLICKR_KEY,
        text: query,
        format: 'json',
        nojsoncallback: 1,
        min_taken_date: now - sixDays,
        media: (videoSearch? 'videos' : 'photos')
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.flickr.com',
        port: 80,
        path: '/services/rest/?' + params,
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http://flickr.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
          "X-Requested-With": "XMLHttpRequest"
        } 
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if (response.photos && response.photos.photo) {
            var photos = response.photos.photo;
            for (var i = 0, len = photos.length; i < len; i++) {
              var photo = photos[i];
              if (photo.ispublic) {
                results.push({
                  url: 'http://www.flickr.com/photos/' +
                      photo.owner + '/' + photo.id + '/',
                  message: photo.title,
                  user: 'http://www.flickr.com/photos/' +
                      photo.owner + '/',
                  type: (videoSearch? 'video' : 'photo')                          
                });
              }
            }
          }
          var output = {
            result: results,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });
    },
    mobypicture: function(requestId) {
      var currentService = 'mobypicture';         
      var params = {
        key: GLOBAL_config.MOBYPICTURE_KEY,
        action: 'searchPosts',
        format: 'json',
        searchTerms: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.mobypicture.com',
        port: 80,
        path: '/?' + params,
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http://mobypicture.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2"
        } 
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var output = {
            result: response,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });

    },
    twitpic: function(requestId) {   
      var currentService = 'twitpic';         
      var params = {
        type: 'mixed',
        page: 1,
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'twitpic.com',
        port: 80,
        path: '/search/show?' + params,
        headers: {
          "Accept": "application/json, text/javascript, */*",
          "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
          "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
          "Connection": "keep-alive",
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http://twitpic.com/search",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
          "X-Requested-With": "XMLHttpRequest"
        } 
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var output = {
            result: response,
            source: currentService
          };
          sendResults(output, currentService, requestId);
        });
      }).on('error', function(e) {
        // error
      });
    }
  };
  if (services[service]) {
    services[service]();
  }
  
  function sendResults(json, service, requestId) {
    if (!requestId) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.query.callback) {      
        res.send(req.query.callback + '(' + JSON.stringify(json) + ')');      
      } else {
        res.send(json);
      }
    } else {    		      
      GLOBAL_requests[requestId][service] = json;
    }     
  }    
}

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);