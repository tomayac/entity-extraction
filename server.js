var DEBUG = false;

var http = require('http');
var querystring = require('querystring');

var express = require('express');
var app = express.createServer();
// app.use(express.bodyParser());

var GLOBAL_requests = {};

app.configure(function(){
  app.use(express.methodOverride());
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

app.get(/^\/entity-extraction\/(.+)\/(.+)$/, extractEntities);

app.post(/^\/entity-extraction\/(.+)$/, extractEntities);

function extractEntities(req, res, next) {
    
  var mergeEntities = function(entities1, entities2) {
    var entities = [];
    entities1.forEach(function(entity1) {
      var contained = false;
      entities2.forEach(function(entity2, index2) {
        var name1 = entity1.name.toLowerCase();
        var name2 = entity2.name.toLowerCase();
        if (name1 === name2) {
          contained = true;
          var uris1 = entity1.uris;
          var uris2 = entity2.uris;

          uris1.forEach(function(uri1) {
            var uriContained = false;
            for (var i = 0, length = uris2.length; i < length; i++) {
              var uri2 = uris2[i];
              if (uri1.uri === uri2.uri) {
                uriContained = true;
                break;
              }
            }
            if (!uriContained) {
              uris2.push(uri1);
            }
          });
          entities2.uris = uris2;
          var relevance1 = entity1.relevance;
          var relevance2 = entity2.relevance;
          entities2[index2].relevance = (relevance1 + relevance2) / 2;
          var provenance1 = entity1.source;
          var provenance2 = entity2.source;
          if (provenance1 !== provenance2) {          
            entities2[index2].source = provenance2 + ',' + provenance1;
          }
        }
      });
      if (!contained) {
        entities.push(entity1);
      }
    });
    entities2 = entities2.concat(entities);
    return entities2;
  }  
  
  var sendEntityExtractionResults = function(json) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.query.callback) {      
      res.send(req.query.callback + '(' + JSON.stringify(json) + ')');      
    } else {
      res.send(JSON.stringify(json));
    }
  }  
  
  var path;
  if (req.body) {
    path = /^\/entity-extraction\/(.+)$/;    
  } else {
    path = /^\/entity-extraction\/(.+)\/(.+)$/;
  }
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  if (DEBUG) console.log('extractEntities => Service: ' + service); 
  
  function sendResults(requestId, entities, service) {
    if (!requestId) {
	    sendEntityExtractionResults(entities);
    } else {    		      
      GLOBAL_requests[requestId][service] = entities;
    }     
  }
  
  var text = req.body? 
      req.body.text:
      decodeURIComponent(pathname.replace(path, '$2'));  
  
  var services = {    
    spotlight: function(requestId) {            
      while (text.split(/\s+/g).length < 25) {
        text = text + ' ' + text;
      }
      var params = {
        confidence: 0.5,
        support: 30,
        text:	text
      };
      params = querystring.stringify(params);
      var options = {
        host: 'spotlight.dbpedia.org',
        port: 80,
        path: '/rest/annotate?' + params,
        headers: {Accept: 'application/json'}     
      };

      http.get(options, function(res) {        
        var response = '';
        res.on('data', function(chunk) {
          response += chunk;
        });
        res.on('end', function() {
          try {
            response = JSON.parse(response);
          } catch(e) {
            sendResults(requestId, [], 'spotlight');
          }
          var entities = [];      	    
          var uris = [];
          if (response.Error || !response.Resources) {
            sendResults(requestId, entities, 'spotlight');
          }
          if (response.Resources) {
            var length1 = response.Resources.length;
            for (var i = 0; i < length1; i++) {
              var entity = response.Resources[i];              
              if (uris.indexOf(entity['@URI']) === -1) {
                uris.push(entity['@URI']);
                var uri = {
                  uri: entity['@URI'],
                  source: 'spotlight'
                };
                entities.push({
                  name: entity['@surfaceForm'],
                  relevance: parseFloat(entity['@similarityScore']),
                  uris: [uri],
                  source: 'spotlight'
                });                                        
              }
            }
          }      	    
          sendResults(requestId, entities, 'spotlight');
  		  }); 		  
      }).on('error', function(e) {
        sendResults(requestId, [], 'spotlight');        
      });       
    },    
    zemanta: function(requestId) {      
      var license = '4eqem8kyjzvkz8d2ken3xprb';
      var params = {
        method: 'zemanta.suggest_markup',
        api_key:	license,
        text:	text,
        format:	'json',
        return_rdf_links: 1
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.zemanta.com',
        method: 'POST',
        port: 80,
        headers: {'Content-Length': params.length},
        path: '/services/rest/0.0/'
      };
      
      var req1 = http.request(options, function(res) {        
        var response = '';
        res.on('data', function(chunk) {
          response += chunk;
        });
        res.on('end', function() {
          try {
            response = JSON.parse(response);
          } catch(e) {
            sendResults(requestId, [], 'zemanta');
          }          
          var entities = [];
          var length1 = response.markup.links.length;
          for (var i = 0; i < length1; i++) {
            var entity = response.markup.links[i];
            var length2 = entity.target.length;
            var uris = [];
            for (var j = 0; j < length2; j++) {
              if (entity.target[j].type === 'rdf') {
                entity.target[j].url =
                    decodeURIComponent(entity.target[j].url);
                uris.push({
                  uri: entity.target[j].url,
                  source: 'zemanta'
                });
              }
            }
            if (uris.length > 0) {
              entities.push({
                name: entity.anchor,
                relevance: parseFloat(entity.confidence),
                uris: uris,
                source: 'zemanta'
              });                          
            }
          }      	    
          sendResults(requestId, entities, 'zemanta');
  		  }); 		  
      }).on('error', function(e) {
        sendResults(requestId, [], 'zemanta');        
      }); 
      req1.write(params);		  
      req1.end();
    },  
    opencalais: function(requestId) {
      var license = 'xxqm6vznsj42scny2tk5dvrv';
      var paramsXml =
          '<c:params ' +
              'xmlns:c="http://s.opencalais.com/1/pred/" '+
              'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
            '<c:processingDirectives ' +
                'c:contentType="TEXT/RAW" ' +
                'c:outputFormat="Application/JSON" ' +
                'c:calculateRelevanceScore="TRUE" ' +
                'c:omitOutputtingOriginalText="TRUE" ' +
                'c:enableMetadataType="SocialTags">' + 
            '</c:processingDirectives>' +
            '<c:userDirectives ' +
                'c:allowDistribution="FALSE" ' +
                'c:allowSearch="FALSE" ' +
                'c:externalID="tomayac.com" ' +
                'c:submitter="Thomas Steiner">' +
            '</c:userDirectives>' +                
          '</c:params>';
      var params = {
          licenseID: license,
          content: text.replace(/%/g, '%25'),        
          paramsXML: paramsXml
      };
      params = querystring.stringify(params);
      var options = {
        host: 'api.opencalais.com',
        method: 'POST',
        port: 80,
        path: '/enlighten/rest/'
      };
      
      var req1 = http.request(options, function(res) {        
        var response = '';
        res.on('data', function(chunk) {
          response += chunk;
        });
        res.on('end', function() {
    	    if (response.indexOf('<Error') !== -1) {
    	      response = {};
    	    } else {
    	      try {
    	        response = JSON.parse(response);
  	        } catch(e) {
              sendResults(requestId, [], 'opencalais');
            }            
  	      }
          var entities = [];
          for (key in response) {
            if (key === 'doc') {
              continue;
            } else {
              if (response[key]['_typeGroup'] === 'entities') {
                var name = response[key]['categoryName']?
                    response[key]['categoryName'] :
                    response[key]['name'];
                var uri = {
                  uri: key,
                  source: 'opencalais'
                };                      
                entities.push({
                  name: name,
                  relevance: parseFloat(response[key].relevance),
                  uris: [uri],
                  source: 'opencalais'
                }); 
              }
            }          
          }
          sendResults(requestId, entities, 'opencalais');
        });
      }).on('error', function(e) {
        sendResults(requestId, [], 'zemanta');        
      }); 
      req1.setHeader('Content-Length', params.length);
      req1.write(params);		  
      req1.end();
    },   
    alchemyapi: function(requestId) {
      var license = '6075eba18cf6fedc3ad522703b22fac10c4440a7';
      var params = {
          apikey:	license,
          text:	text,
          outputMode:	'json',
          disambiguate: 1,
          linkedData: 1,
          coreference: 1,
          quotatioms: 1,
          showSourceText: 0              
      };
      params = querystring.stringify(params);
      
      var options = {
        host: 'access.alchemyapi.com',
        method: 'POST',
        port: 80,
        path: '/calls/text/TextGetRankedConcepts'
      };
      
      var req1 = http.request(options, function(res) {        
        var response = '';
        res.on('data', function(chunk) {
          response += chunk;
        });
        res.on('end', function() {
    	    var results = response;      	    

          var options2 = {
            host: 'access.alchemyapi.com',
            method: 'POST',
            port: 80,
            path: '/calls/text/TextGetRankedNamedEntities'
          };

          var req2 = http.request(options2, function(res2) {        
            var response2 = '';
            res2.on('data', function(chunk) {
              response2 += chunk;
            });
            res2.on('end', function() {              
              try {
        	      results2 = JSON.parse(response2);
      	      } catch(e) {
                sendResults(requestId, [], 'alchemyapi');
              }              
              try {
        	      results = JSON.parse(results);
      	      } catch(e) {
                sendResults(requestId, [], 'alchemyapi');
              }                      	    
        	    results.entities = results2.entities;            	    
        	    var entities1 = [];
              var length1 = results.concepts?
                  results.concepts.length :
                  0;
              for (var i = 0; i < length1; i++) {
                var concept = results.concepts[i];
                var uris = [];
                for (key in concept) {
                  if ((key === 'text') ||
                      (key === 'relevance') ||
                      (key === 'name') ||
                      (key === 'subType') ||
                      (key === 'website') ||
                      (key === 'geo')) {              
                    continue;
                  }
                  concept[key] = decodeURIComponent(concept[key]);
                  uris.push({
                    uri: concept[key],
                    source: 'alchemyapi'
                  });
                }
                if (uris.length > 0) {
                  entities1.push({
                    name: concept.text,
                    relevance: parseFloat(concept.relevance),
                    uris: uris,
                    source: 'alchemyapi'
                  });          
                }
              }
              length1 = results.entities?
                  results.entities.length :
                  0;
              var entities2 = [];
              for (var i = 0; i < length1; i++) {
                var entity = results.entities[i];
                var uris = [];
                if (!entity.hasOwnProperty('disambiguated')) {
                  continue;
                }
                for (key in entity.disambiguated) {
                  if ((key === 'name') ||
                      (key === 'subType') ||
                      (key === 'website') ||
                      (key === 'geo')) {
                    continue;
                  }            
                  entity.disambiguated[key] =
                      decodeURIComponent(entity.disambiguated[key]);
                  uris.push({
                    uri: entity.disambiguated[key],
                    source: 'alchemyapi'
                  });            
                }
                if (uris.length > 0) {
                  entities2.push({
                    name: entity.text,
                    relevance: parseFloat(entity.relevance),
                    uris: uris,
                    source: 'alchemyapi'
                  });          
                }
              }
              var entities = mergeEntities(entities1, entities2);
              sendResults(requestId, entities, 'alchemyapi');
      		  });
          }).on('error', function(e) {
            sendResults(requestId, [], 'alchemyapi');        
          }); 
          req2.setHeader('Content-Length', params.length);
          req2.write(params);		  
          req2.end();
        });
      }).on('error', function(e) {
        sendResults(requestId, [], 'alchemyapi');        
      }); 
      req1.setHeader('Content-Length', params.length);
      req1.write(params);		  
      req1.end();  
    },
    combined: function() {
      function uuid() {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 5; i++) {
          text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
      }      
      var requestId = uuid();
      GLOBAL_requests[requestId] = {
        zemanta: null,
        opencalais: null,
        alchemyapi: null,
        spotlight: null
      };
      services.zemanta(requestId);
      services.opencalais(requestId);
      services.alchemyapi(requestId);
      services.spotlight(requestId);      
      var servicesNames = Object.keys(GLOBAL_requests[requestId]);
      var length = servicesNames.length;      
      var interval = setInterval(function() {
        for (var i = 0; i < length; i++) {
          var serviceName = servicesNames[i];
          if (!GLOBAL_requests[requestId][serviceName]) {
            return;
          }
        }
        clearInterval(interval);
        var results = GLOBAL_requests[requestId][servicesNames[0]];
        for (var i = 1 /* 1, yes! */; i < length; i++) {
          var serviceName = servicesNames[i];
          results = mergeEntities(
              results, GLOBAL_requests[requestId][serviceName]);
        }         
        delete GLOBAL_requests[requestId];
        sendEntityExtractionResults(results);        
      }, 500);
    }
  };
  if (services[service]) {
    services[service]();
  } else {
    if (DEBUG) console.log('Service "' + service + '" not found.');
    next();
  }  
}

var port = process.env.PORT || 8001;
app.listen(port);
console.log('node.JS running on ' + port);