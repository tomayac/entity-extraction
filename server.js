var app = require('express').createServer();

app.get('/', function(req, res){
    res.send('bye bye world');
});

app.listen(80);
console.log('Node running on port ' + 80);