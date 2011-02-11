var express = require('express');
var app = express.createServer();

var fastxml = require('./o3-fastxml');
var querystring = require('querystring');
var uuid = require('node-uuid');
var Step = require('./step/step');
var XMLHttpRequest = require('./xhr/XMLHttpRequest');

var GLOBAL_window = {};

app.configure(function(){
  app.use(express.methodOverride());
  app.use(express.bodyDecoder());
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

app.get(/^\/uri-lookup\/(.+)\/(.+)$/, lookupUris);

app.get(/^\/entity-extraction\/(.+)\/(.+)$/, extractEntities);

app.post(/^\/entity-extraction\/(.+)$/, extractEntities);

app.get(/^\/youtube\/rdf\/(.+?)(\.\w+)?$/, getRdf);

app.put(/^\/youtube\/rdf\/(.+?)(\.\w+)?$/, putRdf);

app.del(/^\/youtube\/rdf\/(.+?)(\.\w+)?$/, delRdf);

app.get(/^\/youtube\/search\/(.+)$/, searchVideo);

app.get(/^\/youtube\/videos\/(.+?)\/closedcaptions\/(\w\w)$/, getClosedCaptionsLanguage);

app.get(/^\/youtube\/videos\/(.+?)\/closedcaptions$/, getClosedCaptions);

app.get(/^\/youtube\/videos\/(.+?)\/audiotranscriptions\/(\w\w)$/, getAudioTranscriptionLanguage);

app.get(/^\/youtube\/videos\/(.+?)\/audiotranscriptions$/, getAudioTranscription);

app.get(/^\/youtube\/videos\/(.+)$/, getVideoData);

app.get(/\//, function(req, res) {
  res.send();
});

function delRdf(req, res, next) {
  console.log('DELETE');
}

function putRdf(req, res, next) {
  console.log('PUT');
}

function getRdf(req, res, next) {
  var rdfBuilder = {};
  
  var path = /^\/youtube\/rdf\/(.+?)(\.\w+)?$/;  
  var pathname = require('url').parse(req.url).pathname;
  var videoId =
      decodeURIComponent(pathname.replace(path, '$1'));      
  console.log('getRdf => Video ID: ' + videoId);
  if (!videoId) {
    next();
  }
  var extension =
      decodeURIComponent(pathname.replace(path, '$2'));      
  console.log('getRdf => Extension: ' + extension);  
 
  var lookupUri = function(label, requestId, i) {
    var xhr = new XMLHttpRequest();  
    var address = app.address();
    var uri = 'http://' + address.address + ':' + address.port + 
        '/uri-lookup/combined/' + encodeURIComponent(label);
    xhr.open('GET', uri, true);  
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {      
        if (xhr.status == 200) {
          var responseText = JSON.parse(xhr.responseText);
          GLOBAL_window[requestId][i] = responseText;
        }
      }
    }
    xhr.send(null);
  }

  var getDescriptionAnnotatedSentences = function() {
    var threshold = 0.2;
    rdfBuilder.annotatedSentences = [];
    var entities = {};
    rdfBuilder.sentences.forEach(function(sentence) {
      var text = sentence.text;
      entities[sentence.start_ms + '-' + sentence.end_ms] = []; 
      rdfBuilder.titleAndDescription.entities.forEach(function(entity) {
        var relevance = entity.relevance;
        if (relevance > threshold) {          
          var name = entity.name;
          var regExp = new RegExp('\\b' + name + '\\b', 'i');
          if (regExp.test(text)) {
            entities[sentence.start_ms + '-' + sentence.end_ms].push(entity);
          }
        }
      });
    });
    rdfBuilder.sentences.forEach(function(sentence) {
      if (entities[sentence.start_ms + '-' + sentence.end_ms].length > 0) {
        rdfBuilder.annotatedSentences.push({
          text: sentence.text,
          start_ms: sentence.start_ms,
          end_ms: sentence.end_ms,
          entities: entities[sentence.start_ms + '-' + sentence.end_ms]
        });
      }
    });   
    getTagAnnotatedSentences();
  }
  
  var getEntityAnnotatedSentences = function() {
    var threshold = 0.2;
    rdfBuilder.annotatedSentences = [];
    var entities = {};
    rdfBuilder.sentences.forEach(function(sentence) {
      var text = sentence.text;
      entities[sentence.start_ms + '-' + sentence.end_ms] = []; 
      rdfBuilder.entities.forEach(function(entity) {
        var relevance = entity.relevance;
        if (relevance > threshold) {          
          var name = entity.name;
          var regExp = new RegExp('\\b' + name + '\\b', 'i');
          if (regExp.test(text)) {
            entities[sentence.start_ms + '-' + sentence.end_ms].push(entity);
          }
        }
      });
    });
    rdfBuilder.sentences.forEach(function(sentence) {
      if (entities[sentence.start_ms + '-' + sentence.end_ms].length > 0) {
        rdfBuilder.annotatedSentences.push({
          text: sentence.text,
          start_ms: sentence.start_ms,
          end_ms: sentence.end_ms,
          entities: entities[sentence.start_ms + '-' + sentence.end_ms]
        });
      }
    });   
    getDescriptionAnnotatedSentences();
  }

  var getTurtle = function() {

    // from https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Date#Example.3a_ISO_8601_formatted_dates
    function ISODateString(d) {
      function pad(n) {
        return n < 10? '0' + n : n;
      }
      return d.getUTCFullYear() + '-' +
          pad(d.getUTCMonth() + 1 ) + '-' +
          pad(d.getUTCDate()) + 'T' +
          pad(d.getUTCHours()) + ':' +
          pad(d.getUTCMinutes()) + ':' +
          pad(d.getUTCSeconds()) + 'Z';
    }
    var now = ISODateString(new Date());      
    
    function getServiceAndResource(name) {
      if (name === 'dbpedia') {
        return [
          'http://lookup.dbpedia.org/',
          'http://lookup.dbpedia.org/api/search.asmx/KeywordSearch?QueryString=',
          'GET'
        ];
      } else if (name === 'freebase') {
        return [
          'http://api.freebase.com/api/service/search',
          'http://api.freebase.com/api/service/search?format=json&query=',
          'GET'
        ];
      } else if (name === 'sindice') {
        return [
          'http://api.sindice.com/v2/search',
          'http://api.sindice.com/v2/search?qt=term&page=1&format=json&q=',
          'GET'
        ];
      } else if (name === 'uberblic') {
        return [
          'http://platform.uberblic.org/api/search',
          'http://platform.uberblic.org/api/search?format=json&query=',
          'GET'
        ];
      } else if (name === 'zemanta') {
        return [
          'http://api.zemanta.com/services/rest/0.0/',
          'http://api.zemanta.com/services/rest/0.0/',
          'POST'
        ];
      } else if (name === 'opencalais') {
        return [
          'http://api.opencalais.com/enlighten/rest/',
          'http://api.opencalais.com/enlighten/rest/',
          'POST'
        ];
      } else if (name === 'alchemyapi') {
        return [
          'http://access.alchemyapi.com/',
          'http://access.alchemyapi.com/calls/text/TextGetRankedNamedEntities',
          'POST'
        ];
      }
    }

    function getProvenanceRdf(graphName, graphId, now, usedData) {
      function createUsedDataRdf(usedData, now) {
        var string = '';
        for (var i = 0, len = usedData.length; i < len; i++) { 
          var data = usedData[i];
          string +=
              '\t\tprv:usedData [\n' +
              '\t\t\tprv:retrievedBy [\n' +
              '\t\t\t\ta prv:DataAcess;\n' +
              '\t\t\t\tprv:performedAt "' + now + '"^^xsd:dateTime;\n' +                                            
              '\t\t\t\tprv:performedBy [\n' +
              '\t\t\t\t\tprv:operatedBy <http://tomayac.com/thomas_steiner.rdf#me>.\n' +
              '\t\t\t\t];\n' +
              '\t\t\t\tprv:accessedService <' + data.service + '>;\n' +              
              (data.method === 'GET'? ('\t\t\t\tprv:accessedResource <' + data.resource + data.text + '>;\n') : '') +
              '\t\t\t\tprvTypes:exchangedHTTPMessage [\n' +
              '\t\t\t\t\ta http:Request;\n' +
              '\t\t\t\t\thttp:httpVersion "1.1";\n';
          var host = data.service.replace(/^http:\/\//, '');
          host = host.substring(0, host.indexOf('/'));
          if (data.method === 'POST') {
            string +=
                '\t\t\t\t\thttp:methodName "POST";\n' +                
                '\t\t\t\t\thttp:headers (\n' +
                '\t\t\t\t\t\t[\n' +
                '\t\t\t\t\t\t\thttp:fieldName "Host";\n' +
                '\t\t\t\t\t\t\thttp:fieldValue "' + host + '";\n' +
                '\t\t\t\t\t\t\thttp:headerName <http://www.w3.org/2008/http-header#host>;\n' +
                '\t\t\t\t\t\t]\n' +
                '\t\t\t\t\t)\n' +                            
                '\t\t\t\t\thttp:body [\n' +                
                '\t\t\t\t\t\tcnt:ContentAsText [\n' +
                '\t\t\t\t\t\t\tcnt:characterEncoding "UTF-8";\n' +
                '\t\t\t\t\t\t\tcnt:chars "' + data.text + '"\n' +
                '\t\t\t\t\t\t];\n' +
                '\t\t\t\t\t];\n';
          } else if (data.method === 'GET') {
            string +=
              '\t\t\t\t\thttp:methodName "GET";\n' +
              '\t\t\t\t\thttp:headers (\n' +
              '\t\t\t\t\t\t[\n' +
              '\t\t\t\t\t\t\thttp:fieldName "Host";\n' +
              '\t\t\t\t\t\t\thttp:fieldValue "' + host + '";\n' +
              '\t\t\t\t\t\t\thttp:headerName <http://www.w3.org/2008/http-header#host>;\n' +
              '\t\t\t\t\t\t]\n' +
              '\t\t\t\t\t)\n' +            
              '\t\t\t\t];\n' +
              '\t\t\t];\n' +
              '\t\t];\n';              
          }
        }
        return string;
      }
      
      var result =
          ':' + graphName + graphId + '\n' +
          '\ta prv:DataItem;\n' +
          '\ta rdfg:Graph;\n' +
          '\tprv:createdBy [\n' +
          '\t\ta prv:DataCreation;\n' +
          '\t\tprv:performedAt "' + now + '"^^xsd:dateTime;\n' +
          '\t\tprv:performedBy [\n' +
          '\t\t\ta prv:NonHumanActor;\n' +
          '\t\t\ta prvTypes:DataCreatingService;\n' +                              
          '\t\t\tprv:operatedBy <http://tomayac.com/thomas_steiner.rdf#me>.\n' +
          '\t\t];\n' + 
          createUsedDataRdf(usedData, now) +          
          '\t].\n\n';    
      return result;  
    }

    var video = rdfBuilder.metadata.entry;
    var turtleBuffer = 
        '@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n' +
        '@prefix ctag: <http://commontag.org/ns#>.\n' + 
        '@prefix ma: <http://www.w3.org/ns/ma-ont#>.\n' +
        '@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.\n' +
        '@prefix bibo: <http://purl.org/ontology/bibo/>.\n' +
        '@prefix prv: <http://purl.org/net/provenance/ns#>.\n' +        
        '@prefix prvTypes: <http://purl.org/net/provenance/types#>.\n' +        
        '@prefix http: <http://www.w3.org/2006/http#>.\n' +
        '@prefix cnt: <http://www.w3.org/2008/content#>.\n' +
        '@prefix rdfg: <http://www.w3.org/2004/03/trix/rdfg-1/>.\n' +        
        '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.\n\n' +
        '<http://dbpedia.org/lookup> a prv:DataProvidingService.\n' +
        '<http://platform.uberblic.org/api/search> a prv:DataProvidingService.\n' +
        '<http://api.freebase.com/api/service/search> a prv:DataProvidingService.\n' +
        '<http://api.sindice.com/v2/search> a prv:DataProvidingService.\n\n' +
        '<http://api.zemanta.com/services/rest/0.0/> a prv:DataProvidingService.\n' +
        '<http://api.opencalais.com/enlighten/rest/> a prv:DataProvidingService.\n' +
        '<http://access.alchemyapi.com/> a prv:DataProvidingService.\n\n';
        
    var videoId = video.id.$t;    
    turtleBuffer +=
        '<' + videoId + '>\n' +
        '\ta ma:MediaResource;\n' +
        '\tma:title "' + video.title.$t + '";\n';
    for (var i = 0, length = video.author.length; i < length; i++) {    
       turtleBuffer += 
          '\tma:creator [\n' +
            '\t\ta foaf:Person;\n' +
            '\t\tfoaf:nick "' + video.author[i].name.$t + '";\n' + 
            '\t\tfoaf:homepage <' + video.author[i].uri.$t + '>;\n' +
            '\t];\n';
    }
    var description = video.content.$t;
    description = description.replace(/[\[\]]/g, '').replace(/\n/g, ' ');
    description = description.replace(/\s+/g, ' ');
    turtleBuffer += 
        '\tma:createDate "' + video.published.$t.substring(0, 10) + '";\n' + 
        '\tma:description "' + description.replace(/"/g, '') + '".\n\n';
        
    var usedData = [];
    var graphName = 'G';
    for (var i = 0, length = rdfBuilder.tags.length; i < length; i++) {            
      var tag = rdfBuilder.tags[i];      
      turtleBuffer +=
          ':' + graphName + i + ' = {\n' + 
          '\t<' + videoId + '> ctag:tagged :tag' + i +
          '.\n\t' + ':tag' + i + '\n' +
          '\t\ta ctag:Tag;\n' +
          '\t\tctag:label "' + tag.label +'";\n';
      tag.entities.forEach(function(entity) {
        entity.uris.forEach(function(uri) {
          turtleBuffer +=        
              '\t\tctag:means <' + uri + '>;\n';          
          entity.source.split(',').forEach(function(name) {
            var temp = getServiceAndResource(name);
            usedData.push({
              service: temp[0],
              resource: temp[1],
              method: temp[2],
              text: encodeURIComponent(tag.label)
            });
          });              
        });
        turtleBuffer += getProvenanceRdf(graphName, i, now, usedData);
      });
      turtleBuffer += '}.\n';      
    }
    
    turtleBuffer += '\n';
    var length1 = rdfBuilder.annotatedSentences.length;
    var usedData = [];
    var graphName = 'H';
    for (var i = 0; i < length1; i++) {                
      var annotation = rdfBuilder.annotatedSentences[i];
      var mediaFragmentUri = videoId + '#t=' + annotation.start_ms / 1000 + ',' + annotation.end_ms / 1000;
      turtleBuffer +=
          '<' + mediaFragmentUri + '> a ma:fragment.\n';
      for (var j = 0, length2 = annotation.entities.length; j < length2; j++) {            
        var graphId = i + '_' + j;
        var entity = annotation.entities[j];      
        turtleBuffer +=
            ':' + graphName + graphId + ' = {\n'+ 
            '\t<' + mediaFragmentUri + '> ctag:tagged :tag' + graphId +
            '.\n\t' + ':tag' + graphId + '\n' +
            '\t\ta ctag:Tag;\n' +
            '\t\tctag:label "' + entity.name +'";\n';
        entity.uris.forEach(function(uri) {          
          turtleBuffer +=        
              '\t\tctag:means <' + (uri.uri? uri.uri : uri) + '>;\n'; // ToDo Ouch!         
        });
        turtleBuffer += '}.\n';
        entity.source.split(',').forEach(function(name) {
          var temp = getServiceAndResource(name);
          usedData.push({
            service: temp[0],
            resource: temp[1],
            method: temp[2],
            text: annotation.text
          });
        });
        turtleBuffer += getProvenanceRdf(graphName, graphId, now, usedData);        
      }      
      turtleBuffer += '\n';            
    }
    
    res.header('Content-Type', 'text/plain');
    if (extension === '.ttl') {
      res.send(turtleBuffer);
    } else if (extension === '.json') {
      res.send(rdfBuilder);
    }
  }
  
  var getTagAnnotatedSentences = function() {
    var threshold = 0.2;
    var entities = []; 
    rdfBuilder.sentences.forEach(function(sentence) {
      entities[sentence.start_ms + '-' + sentence.end_ms] = [];      
      var text = sentence.text;
      rdfBuilder.tags.forEach(function(tag) {
        var label = tag.label;
        tag.entities.forEach(function(entity) {
          var relevance = entity.relevance;
          if (relevance > threshold) {          
            var name = entity.name;
            var regExp1 = new RegExp('\\b' + name + '\\b', 'i');
            var regExp2 = new RegExp('\\b' + label + '\\b', 'i');
            if (regExp1.test(text) || regExp2.test(text)) {
              entities[sentence.start_ms + '-' + sentence.end_ms].push(entity);            
            }            
          }          
        });        
      });
    });
    rdfBuilder.sentences.forEach(function(sentence) {
      if (entities[sentence.start_ms + '-' + sentence.end_ms].length > 0) {      
        rdfBuilder.annotatedSentences.push({
          text: sentence.text,
          start_ms: sentence.start_ms,
          end_ms: sentence.end_ms,
          entities: entities[sentence.start_ms + '-' + sentence.end_ms]
        });
      }
    });    
    getTurtle();
  }  

  var getTitleAndDescription = function() {
    var title = rdfBuilder.metadata.entry.title.$t.replace(/\n/g, ' ');
    var description = rdfBuilder.metadata.entry.content.$t.replace(/\n/g, ' ');    
    var xhr = new XMLHttpRequest();  
    var address = app.address();
    var uri = 'http://' + address.address + ':' + address.port + 
        '/entity-extraction/combined/' + encodeURIComponent(title + ' ' + description);
    xhr.open('GET', uri, true); 
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {      
        if (xhr.status == 200) {
          var responseText = xhr.responseText;
          rdfBuilder.titleAndDescription = {
            plaintext: title + ' ' + description,
            entities: JSON.parse(responseText)
          };
          getEntityAnnotatedSentences();
        }
      }
    }
    xhr.send(null);
  }

  var getTags = function() {
    rdfBuilder.tags = [];
    var requestId = uuid();
    GLOBAL_window[requestId] = {};
    var i = 0;
    rdfBuilder.metadata.entry.category.forEach(function(category) {
      var schemeUri = 'http://gdata.youtube.com/schemas/2007/keywords.cat';
      if (category.scheme === schemeUri) {
        var label = category.term.toLowerCase();
        rdfBuilder.tags.push({
          label: label
        });        
        GLOBAL_window[requestId][i] = null;
        i++;
      }
    }); 
    var length = rdfBuilder.tags.length;
    for (var i = 0; i < length; i++) {
      var label = rdfBuilder.tags[i].label;    
      lookupUri(label, requestId, i);
    }
    var interval = setInterval(function() {
      for (var i = 0; i < length; i++) {
        if (GLOBAL_window[requestId][i] === null) {
          return;
        }
      }
      clearInterval(interval);
      for (var i = 0; i < length; i++) {
        var result = {
          label: rdfBuilder.tags[i].label,
          entities: GLOBAL_window[requestId][i]
        };
        rdfBuilder.tags[i] = result;
      }
      delete GLOBAL_window[requestId];      
      getTitleAndDescription();          
    }, 1000);
  }

  var getClosedCaption = function(lang) {
    var xhr = new XMLHttpRequest();  
    var address = app.address();
    var uri = 'http://' + address.address + ':' + address.port + 
        '/youtube/videos/' + videoId + '/closedcaptions/' + lang;
    xhr.open('GET', uri, true);  
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {      
        if (xhr.status == 200) {
          var responseText = xhr.responseText;
          var closedCaption = JSON.parse(responseText);
          var sentences = [];
          var textBuffer = '';
          var startBuffer = 0;
          var stops = /((.*?)(\.|\?|!))(\s+.*?)?$/g;
          var i = 0;
          closedCaption.plaintext_list.forEach(function(plaintext) {
            var currentCaptionContainedSentence = false;
            var text = plaintext.text;
            text = textBuffer? textBuffer + ' ' + text : text;            
            startBuffer = textBuffer? startBuffer : plaintext.start_ms;                
            while(stops.test(text)) {                            
              currentCaptionContainedSentence = true;
              sentences[i] = {
                text: text.replace(stops, '$1').trim(),
                start_ms: startBuffer,
                end_ms: plaintext.end_ms
              };
              text = text.replace(sentences[i].text, '');                
              i++;              
            }
            textBuffer = text.trim();
            startBuffer = currentCaptionContainedSentence?
                plaintext.start_ms:
                startBuffer;
          });
          rdfBuilder.sentences = sentences;
          getTags();
        }
      }
    }
    xhr.send(null);    
  }
  
  var getVideoAudioTranscription = function(lang) {
    var xhr = new XMLHttpRequest();  
    var address = app.address();
    var uri = 'http://' + address.address + ':' + address.port + 
        '/youtube/videos/' + videoId + '/audiotranscriptions/' + lang;
    xhr.open('GET', uri, true);  
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {      
        if (xhr.status == 200) {
          var responseText = xhr.responseText;
          rdfBuilder.plaintext = responseText;
          getEntities(responseText);
        }
      }
    }
    xhr.send(null);      
  }
  
  var getEntities = function(responseText) {
    var xhr = new XMLHttpRequest();  
    var address = app.address();
    var uri = 'http://' + address.address + ':' + address.port + 
        '/entity-extraction/combined/' + encodeURIComponent(responseText);
    xhr.open('GET', uri, true); 
    xhr.onreadystatechange = function() {
      if (xhr.readyState == 4) {      
        if (xhr.status == 200) {
          var responseText = xhr.responseText;
          rdfBuilder.entities = JSON.parse(responseText);
          getClosedCaption('en'); /* ToDo: make this flexible dynamic */
        }
      }
    }
    xhr.send(null);
  }  
  
  var xhr = new XMLHttpRequest();  
  var address = app.address();
  var uri = 'http://' + address.address + ':' + address.port + 
      '/youtube/videos/' + videoId;
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        var responseText = xhr.responseText;
        rdfBuilder.metadata = JSON.parse(responseText);
        getVideoAudioTranscription('en'); /* ToDo: make this dynamic */
      }
    }
  }
  xhr.send(null);        
}

function getClosedCaptionsLanguage(req, res, next) {
  var sendClosedCaptionsResults = function(json) {
    res.header('Content-Type', 'application/json');
    res.send(json);        
  }
  
  var path = /^\/youtube\/videos\/(.+?)\/closedcaptions\/(\w\w)$/;  
  var pathname = require('url').parse(req.url).pathname;
  var videoId =
      decodeURIComponent(pathname.replace(path, '$1'));      
  console.log('getClosedCaptionsLanguage => Video ID: ' + videoId);
  if (!videoId) {
    next();
  }
  var lang =
      decodeURIComponent(pathname.replace(path, '$2'));      
  console.log('getClosedCaptionsLanguage => Language: ' + lang);
  if (!lang) {
    next();
  }
  var xhr = new XMLHttpRequest();  
  var uri =
      'http://www.youtube.com/watch_ajax?action_get_caption_track_all&v=' +
      videoId;  
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        var responseText = JSON.parse(xhr.responseText);
        if (Array.isArray(responseText)) {
          var length = responseText.length;
          for (var i = 0; i < length; i++) {
            var language = responseText[i]['language'];            
            if (language === lang) {
              var closedCaptions = responseText[i];
              closedCaptions.plaintext_list.forEach(function(closedCaption) {
                closedCaption.text = closedCaption.text.replace(/\n/g, ' ');
                closedCaption.end_ms =
                    closedCaption.start_ms + closedCaption.dur_ms;
              });
              sendClosedCaptionsResults(JSON.stringify(closedCaptions));
              break;
            } else {
              continue;              
            }
          }
        }
      }
    }
  }
  xhr.send(null);
}

function getAudioTranscriptionLanguage(req, res, next) {
  var sendAudioTranscriptionResults = function(json) {
    res.header('Content-Type', 'application/json');
    res.send(json);        
  }
  
  var path = /^\/youtube\/videos\/(.+?)\/audiotranscriptions\/(\w\w)$/;  
  var pathname = require('url').parse(req.url).pathname;
  var videoId =
      decodeURIComponent(pathname.replace(path, '$1'));      
  console.log('getAudioTranscriptionLanguage => Video ID: ' + videoId);
  if (!videoId) {
    next();
  }
  var lang =
      decodeURIComponent(pathname.replace(path, '$2'));      
  console.log('getAudioTranscriptionLanguage => Language: ' + lang);
  if (!lang) {
    next();
  }
  
  var xhr = new XMLHttpRequest();  
  var uri =
      'http://www.youtube.com/watch_ajax?action_get_caption_track_all&v=' +
      videoId;  
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        var responseText = JSON.parse(xhr.responseText);
        if (Array.isArray(responseText)) {
          var length0 = responseText.length;
          var text = [];
          for (var i = 0; i < length0; i++) {
            var language = responseText[i]['language'];            
            if (language === lang) {
              responseText[i]['plaintext_list'].forEach(function(caption, i) {
                text[i] = caption.text.replace(/\n/g, ' '); 
              });
              break;
            } else {
              continue;              
            }
          }
          sendAudioTranscriptionResults(text.join(' '));
        }
      } else {
        next();
      }
    }
  }
  xhr.send(null);  
}

function getAudioTranscription(req, res, next) {
  var sendAudioTranscriptionResults = function(json) {
    res.header('Content-Type', 'application/json');
    res.send(json);        
  }
  
  var path = /^\/youtube\/videos\/(.+?)\/audiotranscriptions$/;  
  var pathname = require('url').parse(req.url).pathname;
  var videoId =
      decodeURIComponent(pathname.replace(path, '$1'));
  console.log('getAudioTranscription => Video ID: ' + videoId);
  if (!videoId) {
    next();
  }

  var xhr = new XMLHttpRequest();  
  var uri =
      'http://www.youtube.com/watch_ajax?action_get_caption_track_all&v=' +
      videoId;  
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        var responseText = JSON.parse(xhr.responseText);
        if (Array.isArray(responseText)) {
          var length0 = responseText.length;
          var availableLanguages = {};          
          for (var i = 0; i < length0; i++) {
            var language = responseText[i]['language'];            
            var text = [];
            responseText[i]['plaintext_list'].forEach(function(caption, i) {
              text[i] = caption.text.replace(/\n/g, ' '); 
            });
            availableLanguages[language] = text.join(' ');
          }
          sendAudioTranscriptionResults(availableLanguages);
        }
      } else {
        next();
      }
    }
  }
  xhr.send(null);  
}

function getVideoData(req, res, next) {
  var sendVideoDataResults = function(json) {
    res.header('Content-Type', 'application/json');
    res.send(json);        
  }
    
  var path = /^\/youtube\/videos\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var videoId =
      decodeURIComponent(pathname.replace(path, '$1'));
  console.log('getVideoData => Video ID: ' + videoId);
  if (!videoId) {
    next();
  }
  var xhr = new XMLHttpRequest();  
  var uri = 'http://gdata.youtube.com/feeds/api/videos/' +
      videoId + '?alt=json&caption';  
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        sendVideoDataResults(xhr.responseText);
      } else {
        next();
      }
    }
  }
  xhr.send(null);
}

function searchVideo(req, res, next) {
  var sendVideoDataResults = function(json) {
    res.header('Content-Type', 'application/json');
    res.send(json);        
  }
    
  var path = /^\/youtube\/search\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var query =
      decodeURIComponent(pathname.replace(path, '$1'));
  console.log('searchVideo => Query: ' + query);
  if (!query) {
    next();
  }
  var xhr = new XMLHttpRequest();  
  var uri = 'http://gdata.youtube.com/feeds/api/videos?max-results=5' +
      '&caption&format=5&v=2&alt=json&q=' + encodeURIComponent(query);
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        sendVideoDataResults(xhr.responseText);
      } else {
        next();
      }
    }
  }
  xhr.send(null);
}

function getClosedCaptions(req, res, next) {
  var sendVideoClosedCaptionsResults = function(json) {
    res.header('Content-Type', 'application/json');
    res.send(json);        
  }
  
  var path = /^\/youtube\/videos\/(.+?)\/closedcaptions$/;
  var pathname = require('url').parse(req.url).pathname;
  var videoId =
      decodeURIComponent(pathname.replace(path, '$1'));
  console.log('getClosedCaptions => Video ID: ' + videoId);
  if (!videoId) {
    next();
  }
  var xhr = new XMLHttpRequest();  
  var uri =
      'http://www.youtube.com/watch_ajax?action_get_caption_track_all&v=' +
      videoId;  
  xhr.open('GET', uri, true);  
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {      
      if (xhr.status == 200) {
        sendVideoClosedCaptionsResults(xhr.responseText);
      } else {
        next();
      }
    }
  }
  xhr.send(null);  
}

function lookupUris(req, res, next) {    
  var maxHits = 1;
  var maxResults = 1;
  var path = /^\/uri-lookup\/(.+)\/(.+)$/;
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  console.log('lookupUris => Service: ' + service);
  var keyword =
      decodeURIComponent(pathname.replace(path, '$2').replace(/%20/g, '+'));
  console.log('lookupUris => Keyword: ' + keyword.replace(/\+/g, ' '));
  if (!keyword) {
    next();
  }
  
  var mergeUris = function(uris1, uris2) {
    var uris = [];  
    uris1.forEach(function(uri1) {
      for (var i = 0, length1 = uris2.length; i < length1; i++) {
        var uri2 = uris2[i];
        for (var j = 0, length2 = uri1.uris.length; j < length2; j++) {
          var uriContained = false;
          for (var k = 0, length3 = uri2.uris.length; k < length3; k++) {          
            if (uri1.uris[j] === uri2.uris[k]) {
              uriContained = true;
              var provenance1 = uri1.source;
              var provenance2 = uri2.source;
              if (provenance1 !== provenance2) {          
                uris2[i].source = provenance2 + ',' + provenance1;
              }          
              var relevance1 = uri1.relevance;
              var relevance2 = uri2.relevance;          
              uris2[i].relevance = relevance1 + relevance2;          
              if (uris2[i].relevance > 1.0) {
                uris2[i].relevance = 1.0
              }
              break;
            }
            if (uriContained) {
              break;
            }
          }
        }
      }
      if (!uriContained) {
        uris2.push(uri1);
      }
    });
    if (maxResults !== 1) {
      return uris2;
    } else {
      var max = 0;    
      var winner = [];
      for (var i = 0, length = uris2.length; i < length; i++) {    
        var uri2 = uris2[i];
        if (uri2.relevance >= max) {
          winner = [uri2];
          max = uri2.relevance;
        }
      }      
      return winner;
    }
  }  
  
  var sendUriLookupResults = function(uris) {
    res.header('Content-Type', 'application/json');
    res.send(JSON.stringify(uris));        
  }

  var services = {
    dbpedia: function(requestId) {
      var xhr = new XMLHttpRequest();
      var uri =
          'http://lookup.dbpedia.org/api/search.asmx/KeywordSearch?' +
          'QueryString=' + keyword + '&MaxHits=' + maxHits;
      xhr.open('GET', uri, true);
      var uris = [];
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var xmlDoc = fastxml.parseFromString(xhr.responseText);
            var results = xmlDoc.getElementsByTagName('Result');
            if (results.length > 0) {
              var length1 = Math.min(results.length, maxHits);
              for (var i = 0; i < length1; i++) {
                var childNodes = results[i].childNodes;
                var length2 = childNodes.length;
                var uri;
                var name;
                for (var j = 0; j < length2; j++) {
                  if (childNodes[j].nodeName === 'URI') {
                    uri = childNodes[j].firstChild.nodeValue;                    
                  } else if (childNodes[j].nodeName === 'Label') {
                    name = childNodes[j].firstChild.nodeValue;
                  }
                }
                uris.push({
                  name: name,
                  uris: [uri],
                  source: 'dbpedia',
                  relevance: 0.25
                });                
              }
        		  if (!requestId) {
        		    sendUriLookupResults(uris);
      		    } else {    		      
                GLOBAL_window[requestId]['dbpedia'] = uris;
      		    }      		                
            } else {
        		  if (!requestId) {
        		    sendUriLookupResults(uris);
      		    } else {    		      
                GLOBAL_window[requestId]['dbpedia'] = uris;
      		    }      		                              
            }                
          } else {
      		  if (!requestId) {
      		    sendUriLookupResults(uris);
    		    } else {    		      
              GLOBAL_window[requestId]['dbpedia'] = uris;
    		    }      		                                          
          }
        }
      }
      xhr.send(null);      
    },
    uberblic: function(requestId) {
      var xhr = new XMLHttpRequest();
      keyword = keyword.replace(/[!\.,;\?]*/g, '');
      var uri = 
          'http://platform.uberblic.org/api/search?' +
          'query=' + encodeURIComponent(keyword) + '&format=json';
      xhr.open('GET', uri, true);
      var uris = [];
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var response = JSON.parse(xhr.responseText);    
            if (response.results && response.results.length) {
              var results = response.results;
              var length = Math.min(results.length, maxHits);                              
              for (var i = 0; i < length; i++) {
                var name = results[i].label;
                var uri2 = results[i].uri;                
                uri2 = uri2.replace(/#.*?$/, '') + '.rdf';
                var xhr2 = new XMLHttpRequest();
                xhr2.open('GET', uri2, true);                  
                xhr2.onreadystatechange = function() {
                  if (xhr2.readyState == 4) {
                    if (xhr2.status == 200) {
                      var responseText = xhr2.responseText.replace(
                          /<umeta:source_uri/g, '<umeta_source_uri');
                      responseText = responseText.replace(
                          /rdf:resource/g, 'rdf_resource');                          
                      var xmlDoc = fastxml.parseFromString(responseText);
                      var results = xmlDoc.getElementsByTagName(
                          'umeta_source_uri');
                      var length = results.length;
                      if (length > 0) {                        
                        for (var j = 0; j < length; j++) {
                          var node = results[j];                          
                          if (node.getAttribute('rdf_resource')) {
                            var resource = node.getAttribute('rdf_resource');
                            // translate from english wikipedia to dbpedia
                            resource = resource.replace(
                                /http:\/\/\w\w\.wikipedia\.org\/wiki\/(.*)$/,
                                'http://dbpedia.org/resource/$1');
                            // translate from freebase rdf to freebase html    
                            resource = resource.replace(
                                /http:\/\/rdf\.freebase\.com\/ns\/(\w+)\.(.*)$/,
                                'http://freebase.com/$1/$2'); 
                            function uriContained(uris, resource) {
                              for (var k = 0, len = uris.length; k < len; k++) {                                                              
                                if (uris[k].uri === resource) {
                                  return true;
                                }
                              }
                              return false;
                            }                                
                            if (!uriContained(uris, resource)) {    
                              uris.push({
                                name: name,
                                uris: [resource],
                                source: 'uberblic',
                                relevance: 0.25
                              });
                            }
                          }
                        }
                  		  if (!requestId) {
                  		    sendUriLookupResults(uris);
                		    } else {    		      
                          GLOBAL_window[requestId]['uberblic'] = uris;
                		    }      		                
                      } else {
                        uris.push({
                          name: name,
                          uris: [uri2],
                          source: 'uberblic',
                          relevance: 0.25
                        });
                		    if (!requestId) {
                		      sendUriLookupResults(uris);
              		      } else {    		      
                          GLOBAL_window[requestId]['uberblic'] = uris;
              		      }      		                                      
                      }
                    } else {
                      uris.push({
                        name: name,
                        uris: [uri2],
                        source: 'uberblic',
                        relevance: 0.25
                      });
                		  if (!requestId) {
                		    sendUriLookupResults(uris);
              		    } else {    		      
                        GLOBAL_window[requestId]['uberblic'] = uris;
              		    }      		                                      
                    }
                  }  
                }                
                xhr2.send(null);                
              }              
            } else {
        		  if (!requestId) {
        		    sendUriLookupResults(uris);
      		    } else {
                GLOBAL_window[requestId]['uberblic'] = uris;
      		    }      		                              
            }  
          } else {
      		  if (!requestId) {
      		    sendUriLookupResults(uris);
    		    } else {    		      
              GLOBAL_window[requestId]['uberblic'] = uris;
    		    }      		                                          
          }            
        }
      }
      xhr.send(null);
    },
    freebase: function(requestId) {
      var xhr = new XMLHttpRequest();      
      var uri = 
          'http://api.freebase.com/api/service/search?' +
          'query=' + encodeURIComponent(keyword) + '&format=json';      
      xhr.open('GET', uri, true);
      var uris = [];
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var response = JSON.parse(xhr.responseText);    
            if (response.result && response.result.length > 0) {
              var result = response.result;
              var length = Math.min(result.length, maxHits);
              for (var i = 0; i < length; i++) {
                var name = result[i].name;
                var uri = 'http://freebase.com' + result[i].id;
                var uri2 = uri.replace(
                      /http:\/\/freebase\.com\/(\w+)\/(.*)$/,
                      'http://rdf.freebase.com\/rdf/$1/$2');
                var xhr2 = new XMLHttpRequest();
                xhr2.open('GET', uri2, true);                  
                xhr2.onreadystatechange = function() {
                  if (xhr2.readyState == 4) {
                    if (xhr2.status == 200) {                      
                      var responseText = xhr2.responseText.replace(
                          /<owl:sameAs/g, '<owl_sameAs');
                      responseText = responseText.replace(
                          /rdf:resource/g, 'rdf_resource');                                                
                      var xmlDoc = fastxml.parseFromString(responseText);
                      var results = xmlDoc.getElementsByTagName('owl_sameAs');
                      var length = results.length;
                      if (length > 0) {
                        for (var j = 0; j < length; j++) {
                          var node = results[j];                        
                          if (node.getAttribute('rdf_resource')) {
                            var resource = node.getAttribute('rdf_resource');
                            resource = resource.replace(
                                /"/g, '&quot;').replace(/&/g, '&amp;');
                            if (uris.indexOf(resource) === -1) {    
                              uris.push({
                                name: name,
                                uris: [resource],
                                source: 'freebase',
                                relevance: 0.25
                              });
                            }
                          }
                        }
                  		  if (!requestId) {
                  		    sendUriLookupResults(uris);
                		    } else {    		      
                          GLOBAL_window[requestId]['freebase'] = uris;
                		    }      		                
                      } else {
                        uris.push({
                          name: name,
                          uris: [uri2],
                          source: 'freebase',
                          relevance: 0.25
                        });                        
                  		  if (!requestId) {
                  		    sendUriLookupResults(uris);
                		    } else {    		      
                          GLOBAL_window[requestId]['freebase'] = uris;
                		    }      		                                                              
                      }
                    } else {
                      uris.push({
                        name: name,
                        uris: [uri2],
                        source: 'freebase',
                        relevance: 0.25
                      });                        
                		  if (!requestId) {
                		    sendUriLookupResults(uris);
              		    } else {    		      
                        GLOBAL_window[requestId]['freebase'] = uris;
              		    }      		                                      
                    }
                  }  
                }
                xhr2.send(null);                
              }
            } else {
        		  if (!requestId) {
        		    sendUriLookupResults(uris);
      		    } else {    		      
                GLOBAL_window[requestId]['freebase'] = uris;
      		    }      		                              
            }  
          } else {
      		  if (!requestId) {
      		    sendUriLookupResults(uris);
    		    } else {    		      
              GLOBAL_window[requestId]['freebase'] = uris;
    		    }      		                                          
          }
        }
      }  
      xhr.send(null);         
    },
    sindice: function(requestId) {
      var xhr = new XMLHttpRequest();            
      keyword = keyword.replace(/[!\.,;\?:]*/g, '');
      var uri =
          'http://api.sindice.com/v2/search?' +            
          'q=' + encodeURIComponent(keyword) +
          '&qt=term&page=1&format=json';  
      var uris = [];
      xhr.open('GET', uri, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var response = JSON.parse(xhr.responseText);    
            if (response.entries) {
              var entries = response.entries;
              var length = Math.min(entries.length, maxHits);
              for (var i = 0; i < length; i++) {
                var name = entries[i].title[0];
                uris[i] = {
                  name: name,
                  uris: [entries[i].link],
                  source: 'sindice',
                  relevance: 0.25
                };
              } 
        		  if (!requestId) {
        		    sendUriLookupResults(uris);
      		    } else {    		      
                GLOBAL_window[requestId]['sindice'] = uris;
      		    }      		                
            } else {
        		  if (!requestId) {
        		    sendUriLookupResults(uris);
      		    } else {    		      
                GLOBAL_window[requestId]['sindice'] = uris;
      		    }      		                              
            }
          } else {
      		  if (!requestId) {
      		    sendUriLookupResults(uris);
    		    } else {    		      
              GLOBAL_window[requestId]['sindice'] = uris;
    		    }      		                                          
          }
        }
      }
      xhr.send(null);               
    },
    combined: function() {
      var requestId = uuid();
      GLOBAL_window[requestId] = {
        dbpedia: null,
        uberblic: null,
        freebase: null,        
        sindice: null
      };
      services.dbpedia(requestId);
      services.uberblic(requestId);
      services.sindice(requestId);
      services.freebase(requestId);      
      var servicesNames = Object.keys(GLOBAL_window[requestId]);
      var length = servicesNames.length;      
      var interval = setInterval(function() {
        for (var i = 0; i < length; i++) {
          var serviceName = servicesNames[i];
          if (GLOBAL_window[requestId][serviceName] === null) {
            return;
          }
        }
        clearInterval(interval);
        var results = GLOBAL_window[requestId][servicesNames[0]];
        if (length > 0) {
          for (var i = 1 /* 1, yes! */; i < length; i++) {
            var serviceName = servicesNames[i];
            results = mergeUris(
                results, GLOBAL_window[requestId][serviceName]);
          }         
        }
        delete GLOBAL_window[requestId];
        sendUriLookupResults(results);
      }, 1000);
    }          
  };  
  if (services[service]) {
    services[service]();
  } else {
    console.log('Service "' + service + '" not found.');
    next();
  }   
}

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
    res.header('Content-Type', 'application/json');
    res.send(JSON.stringify(json));        
  }  
  
  var path;
  if (req.body) {
    path = /^\/entity-extraction\/(.+)$/;    
  } else {
    path = /^\/entity-extraction\/(.+)\/(.+)$/;
  }
  var pathname = require('url').parse(req.url).pathname;
  var service = pathname.replace(path, '$1');
  console.log('extractEntities => Service: ' + service);
  
  var services = {
    zemanta: function(requestId) {      
      var license = '4eqem8kyjzvkz8d2ken3xprb';
      var uri = 'http://api.zemanta.com/services/rest/0.0/';  
      var text = req.body?
          req.body.text:
          decodeURIComponent(pathname.replace(path, '$2'));
      var params = {
        method: 'zemanta.suggest_markup',
        api_key:	license,
        text:	text,
        format:	'json',
        return_rdf_links: 1
      };
      params = querystring.stringify(params);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', uri, true);
      xhr.onreadystatechange = function() {
      	if (xhr.readyState == 4) {
      	  if (xhr.status == 200) {
      	    var response = JSON.parse(xhr.responseText);      	    
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
      		  if (!requestId) {
      		    sendEntityExtractionResults(entities);
    		    } else {    		      
              GLOBAL_window[requestId]['zemanta'] = entities;
    		    }      		  
    		  } else {
      		  if (!requestId) {
      		    sendEntityExtractionResults(entities);
    		    } else {    		      
              GLOBAL_window[requestId]['zemanta'] = entities;
    		    }      		      		    
    		  }
      	}
      }  
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.setRequestHeader('Content-Length', params.length);
      xhr.setRequestHeader('Connection', 'close');
      xhr.send(params);      
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
      var uri = 'http://api.opencalais.com/enlighten/rest/';      
      var text = req.body?
          req.body.text:
          decodeURIComponent(pathname.replace(path, '$2'));
      var params = {
          licenseID: license,
          content: text.replace(/%/g, '%25'),        
          paramsXML: paramsXml
      };
      params = querystring.stringify(params);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', uri, true);
      xhr.onreadystatechange = function() {
      	if (xhr.readyState == 4) {
      	  if (xhr.status == 200) {
      	    var response = JSON.parse(xhr.responseText);
            var entities = [];
            for (key in response) {
              if (key === 'doc') {
                continue;
              } else {
                 var name = response[key]['categoryName']?
                    response[key]['categoryName'] :
                    response[key]['name'];
                var uri = key;    
                if (response[key]['resolutions']) {
                  uri = {
                    uri: response[key]['resolutions'][0].id,
                    source: 'opencalais'
                  };                
                  name = response[key]['resolutions'][0].name;
                }
                if (response[key]['_typeGroup'] === 'entities') {
                  entities.push({
                    name: name,
                    relevance: parseFloat(response[key].relevance),
                    uris: [uri],
                    source: 'opencalais'
                  }); 
                }
              }          
            }
      		  if (!requestId) {
      		    sendEntityExtractionResults(entities);
    		    } else {
              GLOBAL_window[requestId]['opencalais'] = entities;
    		    }      		  
    		  } else {
      		  if (!requestId) {
      		    sendEntityExtractionResults(entities);
    		    } else {
              GLOBAL_window[requestId]['opencalais'] = entities;
    		    }      		      		    
    		  }
      	}
      }  
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.setRequestHeader('Content-Length', params.length);
      xhr.setRequestHeader('Connection', 'close');
      xhr.send(params);            
    },   
    alchemyapi: function(requestId) {
      var license = '6075eba18cf6fedc3ad522703b22fac10c4440a7';
      var uri = 'http://access.alchemyapi.com/';
      var text = req.body?
          req.body.text:
          decodeURIComponent(pathname.replace(path, '$2'));
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
      var xhr = new XMLHttpRequest();
      xhr.open('POST', uri + 'calls/text/TextGetRankedConcepts', true);
      xhr.onreadystatechange = function() {
      	if (xhr.readyState == 4) {
      	  if (xhr.status == 200) {
      	    var results = xhr.responseText;      	    
            var xhr2 = new XMLHttpRequest();
            xhr2.open(
                'POST', uri + 'calls/text/TextGetRankedNamedEntities', true);
            xhr2.onreadystatechange = function() {
            	if (xhr2.readyState == 4) {
            	  if (xhr2.status == 200) {
            	    var results2 = xhr2.responseText;            	    
            	    results2 = JSON.parse(results2);
            	    results = JSON.parse(results);
            	    results.entities = results2.entities;            	    
            	    var entities1 = [];
                  var length1 = results.concepts.length;
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
                  length1 = results.entities.length;
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
            		  if (!requestId) {
            		    sendEntityExtractionResults(entities);
          		    } else {
                    GLOBAL_window[requestId]['alchemyapi'] = entities;
          		    }
          		  } else {
            		  if (!requestId) {
            		    sendEntityExtractionResults(entities);
          		    } else {
                    GLOBAL_window[requestId]['alchemyapi'] = entities;
          		    }          		    
          		  }
            	}
            }  
            xhr2.setRequestHeader(
                'Content-Type', 'application/x-www-form-urlencoded');
            xhr2.setRequestHeader('Content-Length', params.length);
            xhr2.setRequestHeader('Connection', 'close');
            xhr2.send(params);    
    		  } else {
      		  if (!requestId) {
      		    sendEntityExtractionResults(entities);
    		    } else {
              GLOBAL_window[requestId]['alchemyapi'] = entities;
    		    }    		    
    		  }
      	}
      }  
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.setRequestHeader('Content-Length', params.length);
      xhr.setRequestHeader('Connection', 'close');
      xhr.send(params);    
    },
    combined: function() {
      var requestId = uuid();
      GLOBAL_window[requestId] = {
        zemanta: null,
        opencalais: null,
        alchemyapi: null
      };
      services.zemanta(requestId);
      services.opencalais(requestId);
      services.alchemyapi(requestId);
      var servicesNames = Object.keys(GLOBAL_window[requestId]);
      var length = servicesNames.length;      
      var interval = setInterval(function() {
        for (var i = 0; i < length; i++) {
          var serviceName = servicesNames[i];
          if (!GLOBAL_window[requestId][serviceName]) {
            return;
          }
        }
        clearInterval(interval);
        var results = GLOBAL_window[requestId][servicesNames[0]];
        for (var i = 1 /* 1, yes! */; i < length; i++) {
          var serviceName = servicesNames[i];
          results = mergeEntities(
              results, GLOBAL_window[requestId][serviceName]);
        }         
        delete GLOBAL_window[requestId];
        sendEntityExtractionResults(results);        
      }, 1000);
    }
  };

  if (services[service]) {
    services[service]();
  } else {
    console.log('Service "' + service + '" not found.');
    next();
  }  
}

app.listen(3000);
console.log('node.JS running on http://localhost:3000');