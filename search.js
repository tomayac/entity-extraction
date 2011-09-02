var http = require('http');
var https = require('https');
var querystring = require('querystring');
var request = require('request');
var Step = require('./step.js');
var Uri = require('./uris.js');

var express = require('express');
var app = express.createServer();

app.configure(function() {
  app.use(express.methodOverride());
});

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function() {
  app.use(express.errorHandler());
});

var GLOBAL_config = {
  MOBYPICTURE_KEY: 'TGoRMvQMAzWL2e9t',
  FLICKR_SECRET: 'a4a150addb7d59f1',
  FLICKR_KEY: 'b0f2a04baa5dd667fb181701408db162',
  YFROG_KEY: '89ABGHIX5300cc8f06b447103e19a201c7599962',
  INSTAGRAM_KEY: '82fe3d0649e04c2da8e38736547f9170',
  INSTAGRAM_SECRET: '4cf97de2075c4c8fbebdde57c5f9705a',
  HEADERS: {
    "Accept": "application/json, text/javascript, */*",
    "Accept-Charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
    "Accept-Language": "en-US,en;q=0.8,fr-FR;q=0.6,fr;q=0.4,de;q=0.2,de-DE;q=0.2,es;q=0.2,ca;q=0.2",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded",    
    "Referer": "http://www.google.com/",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.854.0 Safari/535.2",
  },
  MEDIA_PLATFORMS: '(yfrog.com OR instagr.am OR flic.kr OR moby.to OR youtu.be OR twitpic.com OR lockerz.com OR picplz.com OR qik.com OR ustre.am OR twitvid.com)',
  URL_REGEX: /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig
};

app.get(/^\/search\/(.+)\/(.+)$/, search);

function search(req, res, next) {  
  /** 
   * Stolen from https://developer.mozilla.org/en/JavaScript/Reference/Global_-
   * Objects/Date#Example:_ISO_8601_formatted_dates
   */
  function getIsoDateString(d) {  
   function pad(n) { return n < 10 ? '0' + n : n }
   d = new Date(d);
   return d.getUTCFullYear() + '-' +
        pad(d.getUTCMonth() + 1) + '-' +
        pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) + ':' +
        pad(d.getUTCMinutes()) + ':' +
        pad(d.getUTCSeconds()) + 'Z';
  }

  /**
   * Removes line breaks, double spaces, etc.
   */
  function cleanMessage(message) {
    return message.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ');    
  }  
  
  /**
   * Sends the results back to the server
   */
  function sendResults(json, service, pendingRequests) {
    var json = {
      result: json,
      source: service
    };      
    if (!pendingRequests) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.query.callback) {      
        res.send(req.query.callback + '(' + JSON.stringify(json) + ')');      
      } else {
        res.send(json);
      }
    } else {
      console.log('Done: ' + service);
      pendingRequests[service] = json;
    }
  }
    
  var path = /^\/search\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  var query = decodeURIComponent(pathname.replace(path, '$2'));  

  var services = {    
    facebook: function(pendingRequests) {      
      var currentService = 'facebook';         
      var params = {
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'graph.facebook.com',
        port: 443,
        path: '/search?' + params + '&type=post',
        headers: GLOBAL_config.HEADERS
      };
      https.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var results = [];
          if ((response.data) && (response.data.length)) {
            var items = response.data;
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              if (item.type !== 'photo' && item.type !== 'video') {
                continue;
              }
              var timestamp = Date.parse(item.created_time);
              var message = '';
              message += (item.name ? item.name : '');
              message += (item.caption ?
                  (message.length ? '. ' : '') + item.caption : '');
              message += (item.description ?
                  (message.length ? '. ' : '') + item.description : '');
              message += (item.message ?
                  (message.length ? '. ' : '') + item.message : '');                            
              results.push({
                /*
                url: 'https://www.facebook.com/permalink.php?story_fbid=' + 
                    item.id.split(/_/)[1] + '&id=' + item.from.id,
                */
                url: item.type === 'video' ?
                    item.source :
                    item.picture,
                message: cleanMessage(message),
                user: 'https://www.facebook.com/profile.php?id=' + item.from.id,
                type: item.type,
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          sendResults(results, currentService, pendingRequests);
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });
    },
    twitter: function(pendingRequests) {
      var currentService = 'twitter';         
      var params = {
        q: query + ' ' + GLOBAL_config.MEDIA_PLATFORMS + ' -"RT "'
      };
      params = querystring.stringify(params);
      var options = {
        host: 'search.twitter.com',
        port: 80,
        path: '/search.json?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var results = [];
          if ((response.results) && (response.results.length)) {
            var items = response.results;
            var itemStack = [];            
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              // extract all URLs form a tweet
              var urls = [];
              text = item.text.replace(GLOBAL_config.URL_REGEX, function(url) {
                var targetURL = (/^\w+\:\//.test(url) ? '' : 'http://') + url;
                urls.push(targetURL);
              });              
              // for each URL prepare the options object
              var optionsStack = [];                    
              for (var j = 0, len2 = urls.length; j < len2; j++) {
                var url = urls[j];
                var urlObj = new Uri(url);
                var options = {
                  host: urlObj.heirpart().authority().host(),
                  method: 'HEAD',
                  port: (url.indexOf('https') === 0 ? 443 : 80),
                  path: urlObj.heirpart().path() +
                      (urlObj.querystring() ? urlObj.querystring() : '') +
                      (urlObj.fragment() ? urlObj.fragment() : ''),
                  headers: GLOBAL_config.HEADERS
                };
                optionsStack[j] = options;
              }              
              itemStack[i] = {
                urls: urls,
                options: optionsStack,
                item: item                
              };              
            }
            // for each tweet retrieve all URLs and try to expand shortend URLs
            Step(            
              function() {              
                var group = this.group();
                itemStack.forEach(function (obj) {
                  obj.options.forEach(function(options) {
                    var cb = group();
                    if (options.port === 80) {
                      var url = 'http://' + options.host + options.path;    
                      http.get(options, function(reply2) {
                        cb(null, {
                          req: reply2,
                          url: url
                        });
                      }).on('error', function(e) {
                        cb(null, {
                          req: null,
                          url: url
                        });
                      });                    
                    } else if (options.port === 443) {
                      var url = 'https://' + options.host + options.path;    
                      https.get(options, function(reply2) {
                        cb(null, {
                          req: reply2,
                          url: url
                        });
                      }).on('error', function(e) {
                        cb(null, {
                          req: null,
                          url: url
                        });
                      });                                          
                    }  
                  });
                });       
              },     
              function(err, replies) { 
                var locations = [];
                replies.forEach(function(thing, i) {
                  if ((thing.req.statusCode === 301) ||
                      (thing.req.statusCode === 302)) {
                    locations[i] = thing.req.headers.location;
                  } else {
                    locations[i] = thing.url;
                  }
                });
                for (var i = 0, len = itemStack.length; i < len; i++) {
                  itemStack[i].urls.forEach(function(url, j) {
                    var item = itemStack[i].item;
                    var timestamp = Date.parse(item.created_at);
                    results.push({
                      url: locations[i + j],
                      message: cleanMessage(item.text),
                      user: 'http://twitter.com/' + item.from_user,
                      type: 'micropost',
                      timestamp: timestamp,
                      published: getIsoDateString(timestamp)
                    });                          
                  });
                }
                sendResults(results, currentService, pendingRequests);
              }
            );            
          } else {
            sendResults([], currentService, pendingRequests);
          }          
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });               
    },
    instagram: function(pendingRequests) {
      var currentService = 'instagram';         
      var params = {
        client_id: GLOBAL_config.INSTAGRAM_KEY
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/tags/' +
            query.replace(/\s*/g, '').replace(/\W*/g, '').toLowerCase() +
            '/media/recent?' + params,
        headers: GLOBAL_config.HEADERS
      };
      https.get(options, function(reply) { 
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {   
          response = JSON.parse(response);
          var results = [];
          if ((response.data) && (response.data.length)) {
            var items = response.data;
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = parseInt(item.created_time + '000', 10);
              results.push({
                url: item.images.standard_resolution.url,
                message: cleanMessage(
                    item.caption.text + '. ' + item.tags.join(', ')),
                user: 'https://api.instagram.com/v1/users/' + item.user.id,
                type: item.type === 'image'? 'photo' : '',
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          sendResults(results, currentService, pendingRequests);
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });                       
    },    
    youtube: function(pendingRequests) {
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
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);          
          var results = [];
          if ((response.data) && (response.data.items)) {
            var items = response.data.items;
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = Date.parse(item.uploaded);
              results.push({
                url: item.player.default,
                message: cleanMessage(item.title + '. ' + item.description),
                user: 'http://www.youtube.com/' + item.uploader,
                type: 'video',
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          sendResults(results, currentService, pendingRequests);
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });                       
    },
    flickrvideos: function(pendingRequests) {
      services.flickr(pendingRequests, true);
    },
    flickr: function(pendingRequests, videoSearch) {     
      var currentService = videoSearch ? 'flickrvideos' : 'flickr';         
      var now = new Date().getTime();
      var sixDays = 86400000 * 6;
      var params = {
        method: 'flickr.photos.search',
        api_key: GLOBAL_config.FLICKR_KEY,
        text: query,
        format: 'json',
        nojsoncallback: 1,
        min_taken_date: now - sixDays,
        media: (videoSearch ? 'videos' : 'photos'),
        per_page: 10
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.flickr.com',
        port: 80,
        path: '/services/rest/?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if ((response.photos) && (response.photos.photo)) {
            var photos = response.photos.photo;
            Step(            
              function() {              
                var group = this.group();
                for (var i = 0, len = photos.length; i < len; i++) {
                  var photo = photos[i];
                  if (photo.ispublic) {                
                    var params = {
                      method: 'flickr.photos.getInfo',
                      api_key: GLOBAL_config.FLICKR_KEY,
                      format: 'json',
                      nojsoncallback: 1,
                      photo_id: photo.id
                    };
                    params = querystring.stringify(params);
                    var options = {
                      host: 'api.flickr.com',
                      port: 80,
                      path: '/services/rest/?' + params,
                      headers: GLOBAL_config.HEADERS
                    };
                    var cb = group();                
                    http.get(options, function(reply2) {        
                      var response2 = '';
                      reply2.on('data', function(chunk) {
                        response2 += chunk;
                      });
                      reply2.on('end', function() {      
                        response2 = JSON.parse(response2);                
                        var photo2 = response2.photo;
                        var timestamp = Date.parse(photo2.dates.taken);
                        results.push({
                          url: 'http://www.flickr.com/photos/' +
                              photo2.owner.nsid + '/' + photo2.id + '/',
                          message: cleanMessage(photo2.title._content + '. ' +
                              photo2.description._content),
                          user: 'http://www.flickr.com/photos/' +
                              photo2.owner.nsid + '/',
                          type: (videoSearch ? 'video' : 'photo'),
                          timestamp: timestamp,
                          published: getIsoDateString(timestamp)
                        });
                        cb();             
                      });
                    }).on('error', function(e) {
                      cb();
                    });
                  }
                }
              },
              function() {
                sendResults(results, currentService, pendingRequests);
              }
            );
          } else {
            sendResults([], currentService, pendingRequests);
          }
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });
    },
    mobypicture: function(pendingRequests) {
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
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if ((response.results) && (response.results.length)) {
            var items = response.results;            
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i];
              var timestamp = item.post.created_on_epoch;
              results.push({
                url: item.post.media.url_full,
                message: cleanMessage(
                    item.post.title + '. ' + item.post.description),
                user: item.user.url,
                type: item.post.media.type,
                timestamp: timestamp,
                published: getIsoDateString(timestamp)
              });
            }
          }
          sendResults(results, currentService, pendingRequests);
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });
    },
    twitpic: function(pendingRequests) {   
      var currentService = 'twitpic';         
      var params = {
        type: 'mixed',
        page: 1,
        q: query
      };
      params = querystring.stringify(params);
      var options = {
        host: 'web1.twitpic.com',
        port: 80,
        path: '/search/show?' + params,
        headers: GLOBAL_config.HEADERS
      };
      http.get(options, function(reply) {        
        var response = '';
        reply.on('data', function(chunk) {
          response += chunk;
        });
        reply.on('end', function() {      
          response = JSON.parse(response);
          var results = [];
          if (response.length) {            
            Step(
              function() {
                var group = this.group();
                for (var i = 0, len = response.length; i < len; i++) {
                  var item = response[i];
                  var id = item.link.replace(/.*?\/(\w+)$/, '$1');
                  params = {
                    id: id
                  };
                  params = querystring.stringify(params);
                  options = {
                    host: 'api.twitpic.com',
                    port: 80,
                    path: '/2/media/show.json?' + params,
                    headers: GLOBAL_config.HEADERS
                  };
                  var cb = group();                  
                  http.get(options, function(reply2) {        
                    var response2 = '';
                    reply2.on('data', function(chunk) {
                      response2 += chunk;
                    });
                    reply2.on('end', function() {      
                      response2 = JSON.parse(response2);                  
                      var timestamp = Date.parse(response2.timestamp);
                      results.push({
                        url: 'http://twitpic.com/' + response2.short_id,
                        message: cleanMessage(response2.message), 
                        user: 'http://twitter.com/' + response2.user.username,
                        type: 'photo',
                        timestamp: timestamp,
                        published: getIsoDateString(timestamp)
                      });
                      cb();
                    });
                  }).on('error', function(e) {
                    cb();
                  });
                }
              },
              function() {
                sendResults(results, currentService, pendingRequests);
              }
            );
          } else {
            sendResults(results, currentService, pendingRequests);
          }
        });
      }).on('error', function(e) {
        sendResults([], currentService, pendingRequests);
      });
    }
  };
  if (services[service]) {
    services[service]();
  } 
  if (service === 'combined') {
    var serviceNames = Object.keys(services);
    var pendingRequests = {}
    serviceNames.forEach(function(serviceName) {
      pendingRequests[serviceName] = false;
      services[serviceName](pendingRequests); 
    });

    var length = serviceNames.length;
    var intervalTimeout = 500;
    var timeout = 40 * intervalTimeout;
    var passedTime = 0;
    var interval = setInterval(function() {
      passedTime += intervalTimeout;
      for (var i = 0; i < length; i++) {
        if (passedTime >= timeout) {
          break;
        }
        var serviceName = serviceNames[i];
        if (pendingRequests[serviceName] === false) {
          return;
        }
      }
      clearInterval(interval);
      var results = pendingRequests;
      sendResults(results, 'combined', false);
      pendingRequests = {};
    }, intervalTimeout);    
  } 
}

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);