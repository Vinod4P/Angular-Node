/*
Description:Server code for User management and Collaborative Whiteboard, Document Sharing and Chat(Public & Public).
Author(s):Narayanasamy S, Sneha I
*/
//configure socket.io connection

  var http = require('http')
	//This module contains utilities for dealing with file paths.
	, path = require('path')
	//It providing high performance "plugins" known as middleware.
	, connect = require('./node/node_modules/connect')
	//Fast, minimalist web framework for node.
	, express = require('./node/node_modules/express')
	, app = express()
	, content = require('./ContentServer.js');
	//Socket.IO is a Node.JS project that makes WebSockets and realtime possible in all browsers
  var server = http.createServer(app)
	, io = require('./node/node_modules/socket.io').listen(server); 
	//For log configuration: default: 3; 0 - error; 1 - warn; 2 - info; 3 - debug
	io.set('log level', 1);
	var port = 8090;
	var MeetingManager = require("./modules/MeetingManager.js");
	
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
	app.configure(function() {
		app.use(allowCrossDomain);	
		app.use(express.static(__dirname + '/public'));
	});	
	server.listen(port);
	 
  //CRJH: Rename the variables and files as 'Service' instead of 'Server'
  //load the required modules
  var userService = require('./modules/UserService.js');
  var chatService = require('./modules/ChatService.js');
  var docShareService = require('./modules/DocShareService.js');
  var whiteBoardService = require('./modules/WhiteBoardService.js');
  var tabSwitchService = require('./modules/TabSwitchService.js');
  
  var userNamespace = '/userConnection';
  var chatNamespace = '/chatConnection';
  var docShareNamespace = '/docShareConnection';
  var whiteBoardNamespace = '/whiteBoardConnection';
  var tabSwitchNamespace = '/tabSwitchConnection';
  
  //-----------------------------------------------
  //REST API Calls 
  app.get('/api/users/getoption',userService.getOptionType);
  
  app.get('/api/users/getPrivacytype',userService.getPrivacytypeName); 
  
  app.get('/api/users/getTagDetails/:username',userService.getProfileDetails);
  
  app.get('/api/users/:username',userService.getUser);
  
  app.get('/api/users/check/:username',userService.getUserAvailabilityStatus);
  
  app.get('/api/users/getuser',userService.getUserByUserInfo);
  
  app.get('/api/users/all',userService.getAllUsers);
  
  app.get('/api/users/search/:username',userService.searchUser);
  
  app.get('/api/users/getfriendlist/:username',userService.getFriendsList);
  
  app.get('/api/users/getfriendsinvitations/:username',userService.getFriendsInvitations);
  
  app.get('/api/users/getmeetings/:username',userService.getMeetingsByUserName);
  
  app.get('/api/users/getonlineusers/:username',userService.getOnlineUsersList);
  
  app.get('/api/users/getoauthuser/:id',userService.getOauthUsers);
  
  
  app.post('/api/users/',userService.addNewUser);
  
  app.post('/api/users/addoauthuser',userService.addOauthNewUser);
    
  app.post('/api/users/login',userService.login);
  
  app.post('/api/users/sendfriendrequest',userService.sendFriendRequest);
  
  app.post('/api/users/acceptfriendrequest',userService.acceptFriendRequest);
  
  app.post('/api/users/rejectfriendrequest',userService.rejectFriendRequest);

  app.post('/api/users/sendnotification',sendNotification);

  app.post('/api/users/broadcastingmessage',broadcastingMessage);
    
  app.post('/api/users/sendmeetinginvitation',userService.sendMeetingInvitation);
  
  app.post('/api/users/rejectmeetinginvitation',userService.rejectMeetingInvitation);
  
  app.put('/api/users/:username',userService.updateUserByName);
  
  app.put('/api/users/updateoauthuser/:id',userService.updateOauthUserById);
  
  app.delete('/api/users/:userid',userService.deleteUserByUserId);

  
  //--------------------------------------------------
   
  //for redirecting the userConnection
  io.of(userNamespace).on('connection', function (socket) {
	//console.log('userConnection connect');
	userService.setSocketConnetion(socket,io,userNamespace,app,http);
  });
  
  //for redirecting the chatConnection
  io.of(chatNamespace).on('connection', function (socket) {
	//console.log('chatConnection connect');
	chatService.setSocketConnetion(socket,io,chatNamespace);
  });
  //for redirecting the docShareConnection
  io.of(docShareNamespace).on('connection', function (socket) {
	//console.log('docShareConnection connect');
	docShareService.setSocketConnetion(socket,io,docShareNamespace);
  });
   //for redirecting the whiteBoardConnection
  io.of(whiteBoardNamespace).on('connection', function (socket) {
	//console.log('whiteBoardConnection connect');
	whiteBoardService.setSocketConnetion(socket,io,whiteBoardNamespace);
  });
  //for redirecting the tabConnection
  io.of(tabSwitchNamespace).on('connection', function (socket) {
	//console.log('tabConnection connect');
	tabSwitchService.setSocketConnetion(socket,io,tabSwitchNamespace);
  });

  function sendNotification(req,res)
  {
	req.addListener('data', function(message)
		{
		var command = JSON.parse(message);
		var destination = command.userName;
		var data = command.data;
		var remoteMethodName = command.remoteMethodName;
		var clients = {};
		clients = io.of(userNamespace).clients();
		clients.forEach(
			function(element, index, array)
				{
					if(destination == element.userName)
					{
						io.of(userNamespace).sockets[element.id].emit(remoteMethodName,data);		
					}
				});	
			res.send(data);
		});				
  };
  function broadcastingMessage(req,res)
  {
  	req.addListener('data', function(message)
		{
			var command = JSON.parse(message);
			var data = command.data;
			var remoteMethodName = command.remoteMethodName;
			var roomId = command.roomId;
			io.of(userNamespace).in(roomId).emit(remoteMethodName, data);
			res.send(data);
		});				
  };
