var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);
var mysql = require('./node_modules/mysql');

//set the CrossDomain for allow the client to access.
	var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
	res.header('Access-Control-Allow-Credentials', 'true');
	
	if( req.method.toLowerCase() === "options" ) 
		{
			res.send( 200 );
		}
		else {
			next();
		} 
	}
	
	app.use(allowCrossDomain);	
	app.use(express.static(__dirname+'/MyApp'));

	app.post('/api/users/login',userLogin);
	app.get('/api/users/all',getAllUsers);
	
	//for DB connection
var userdbConnection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test'
});
userdbConnection.connect();

server.listen(8090, function() {
  console.log('server up and running at 8090 port');
});

io.on('connection', function(socket) {
  socket.on('message', function(customer) {
   console.log('SUCCESS');
   
		userdbConnection.query("SELECT * FROM user where user.user_name = '" + customer + "' AND user_password='"+customer+"'", function(err, rows, fields)
				{
				    if (err)
						throw err;
					// If username & password match
					if (rows.length > 0)
					{
					    var data = JSON.stringify(rows[0]);
						console.log(data);
						socket.emit('loginVerifieduser',data);
					}
					// username & password mismatch
					else
					{
						socket.emit('loginFailed');
					}
				});
	});
});

function userLogin(req, res)
	{
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);
			userName = command.username;
			password = command.password;
			
			//Verifying username & password are not null
			if (userName != "" && password != "")
			{
				
				userdbConnection.query("SELECT * FROM user where user.user_name = '" + userName + "' AND user_password='"+password+"'", function(err, rows, fields)
				{
					if (err)
						throw err;
					// If username & password match
					if (rows.length > 0)
					{
						var data = JSON.stringify({'message': 'LOGIN_SUCCESS','data':rows[0]});
						res.send(data);
					}
					// username & password mismatch
					else
					{
						var data = JSON.stringify({'message': 'LOGIN_FAILED'});
						res.send(data);
					}
				});
			}
			else
			{
				var data = JSON.stringify({'message': 'LOGIN_FAILED'});
				res.send(data);
			}
		});
	};
	
function getAllUsers(req, res)
	{
		userdbConnection.query("SELECT * FROM USER", function(err, rows, fields)
		{
			if (err)
				throw err;
			if (rows.length > 0)
			{				
				var result =[];
				var data = JSON.stringify(rows);
				result.push(rows);
				res.send(data);
			}
			else
			{
				res.send('NO_DATA_FOUND');
			}
		});
	};



