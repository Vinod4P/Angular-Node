//local variables for maintain the objects 
var socket = null;
var io = null;
//for store the global online user details 
var authenticatedUsers = {};
//for maintain all the meeting details
var meetingRooms = {};
var userNamespace = null;
var clearTimer=null;
var app;
var mysql = require('../node/node_modules/mysql');
var url = require('url');
var MeetingManager = require("../modules/MeetingManager.js");
var redis = require("../node/node_modules/redis");
var dataStore = MeetingManager.getRadisObject();
var http = require('http');
var userName;
var passWord;
//for DB connection
var userdbConnection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'amma',
    database: 'xapp'
});
userdbConnection.connect();
module.exports.setSocketConnetion = setSocketConnetion;
module.exports.addNewUser = addNewUser;
module.exports.addOauthNewUser = addOauthNewUser;
module.exports.login = login;
module.exports.getUserAvailabilityStatus = getUserAvailabilityStatus;
module.exports.getUserByUserInfo = getUserByUserInfo;
module.exports.getAllUsers = getAllUsers;
module.exports.deleteUserByUserId = deleteUserByUserId;
module.exports.updateUserByName = updateUserByName;
module.exports.updateOauthUserById = updateOauthUserById;
module.exports.searchUser = searchUser;
module.exports.getFriendsInvitations = getFriendsInvitations;
module.exports.getFriendsList = getFriendsList;
module.exports.sendFriendRequest = sendFriendRequest;
module.exports.acceptFriendRequest = acceptFriendRequest;
module.exports.rejectFriendRequest = rejectFriendRequest;
module.exports.getMeetingsByUserName = getMeetingsByUserName;
module.exports.sendMeetingInvitation = sendMeetingInvitation;
module.exports.rejectMeetingInvitation = rejectMeetingInvitation;
module.exports.getOnlineUsersList = getOnlineUsersList;
module.exports.getOauthUsers = getOauthUsers;
module.exports.getUser = getUser;
module.exports.getOptionType = getOptionType;
module.exports.getPrivacytypeName=getPrivacytypeName;
module.exports.getProfileDetails = getProfileDetails;
module.exports.removeFriendContact = removeFriendContact;

function setSocketConnetion(socket, io, userNamespace, app, http)
    {
	   this.io = io;
	   this.socket = socket;
	   this.userNamespace = userNamespace;
	   this.app = app;
	   MeetingManager.dataSubscribe('FRIEND_REQUEST_BUS');
	   
	   socket.on('login', function(data) {
	   var command = JSON.parse(data)
	   userName = command.username;
	   passWord = command.password;

	    //check user already exist in the online users list
		if(authenticatedUsers[userName]!=null)
		{
		    console.log('user is exist');
		    //To check whether user is disconnected or not.
			//Diconnection takes some time for clearing the user details. So to avoid the duplicate login
			if(authenticatedUsers[userName].isDisconnected==true)
			{
				authenticatedUsers[userName].isReconnected=true;
				updateUserDetails(userName,false,'LOGIN');
				//to get the user's meeting details from back-end for entering into the session
				dataStore.hmget(userName,"MEETING_DETAILS",function(err,res){
					if (err) throw err;
					if(res!='null' && res!='')
					{
						var obj = JSON.parse(res);
						var currentRoomId = obj.roomId;
						if(currentRoomId!=null)
						{
							if(meetingRooms[currentRoomId]!=null)
							{
								initiateJoinRoom(currentRoomId);
							}
							else
							{
								socket.emit('loginVerifieduser');
							}
						}
					}
					else
					{
						socket.emit('loginVerifieduser');
					}
				});
			}
			else
			{
				io.of(userNamespace).sockets[socket.id].emit('duplicateMessage',userName,passWord);
			}
			//update online user list
			updateOnlineUsersList();
		}
		//user is not exist
		else
		{
		    console.log('user is exist');
			var mydata = JSON.stringify({"username": userName,
                "password": passWord
            });
            // prepare the header
            var postheaders = {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(mydata, 'utf8')
            };
            // the post options
            var optionspost = {
                host: 'localhost',
                port: 8090,
                method: 'POST',
                path: '/api/users/login',
                headers: postheaders
            };

			// do the POST call
            var reqPost = http.request(optionspost, function(res) {
                res.on('data', function(data)
                {
                    var command = JSON.parse(data);
                    if (command.message == 'LOGIN_SUCCESS')
                    {
					    userdbConnection.query("SELECT user_picture FROM user where user_name = '" + userName + "'", function(err, rows, fields)
						{
						var picturePath = rows[0].user_picture;
						socket.userName = userName;
						//maintain the user details in the global array and set user role as participant
                        authenticatedUsers[userName] = {'userName': userName, 'id': socket.id, 'role': 'PARTICIPANT', 'status': 'ONLINE','picture': picturePath,'isReconnected':false,'isDisconnected':false};
                        socket.emit('loginVerifieduser');
                        //update online user list
                        updateOnlineUsersList();
						dataStore.hmset(userName,"USER_DETAILS",JSON.stringify(authenticatedUsers[userName]));
						});
                    }
                    else
                    {
					    socket.emit('loginFailed');
                    }
                });
			  }).end(mydata);
			}
		});
		
		//To login the duplicate user
		socket.on('loginDuplicateUser',function(userName,passWord)
		{
			duplicateUserManager(userName,passWord,'LOGIN_DUPLICATE_USER');
		});
		
		//To logout the duplicate user
		socket.on('logoutDuplicateuser',function(userName)
		{
			duplicateUserManager(userName,null,'LOGOUT_DUPLICATE_USER');
		})
		
		//To show duplicate login message to the previous user
		socket.on('duplicateNotification',function(userName,passWord)
		{
			MeetingManager.saveData('DuplicateUser_'+userName,socket.id);
			duplicateUserManager(userName,passWord,'DUPLICATE_NOTIFICATION');
		});
		
		//To manage duplicate user entry
		function duplicateUserManager(userName,passWord,context)
		{
			dataStore.lrange('DuplicateUser_'+userName,0,-1, function(err,res){
			if (err) throw err;
				if(res !='' && res !=undefined)
					{
						var duplicateIds =  res; 
						duplicateIds.forEach(
						function(element, index, array)
						{
						    if(io.of(userNamespace).sockets[(element)]!=null)
							{
							    if(context=='LOGIN_DUPLICATE_USER')
								{
								   io.of(userNamespace).sockets[(element)].emit('duplicateLogin',userName,passWord);
								}
								else if(context=='DUPLICATE_NOTIFICATION')
								{
									io.of(userNamespace).sockets[(authenticatedUsers[userName].id)].emit('duplicateUser',userName,passWord);
								}
								else if(context=='LOGOUT_DUPLICATE_USER')
								{
									io.of(userNamespace).sockets[(element)].emit('duplicateLogout',userName);
								}
							}
							
						})
					}
				});
		}
		
		//for allow the duplicate user into the session
		socket.on('enterDuplicateUser', function(userName,passWord) 
		{
			userdbConnection.query("SELECT * FROM user where user.user_name = '" + userName + "' AND user_password='"+passWord+"'", function(err, rows, fields)
            {
                if (err)
                    throw err;
			    // If username & password match
                if (rows.length > 0)
                {
					dataStore.hmget(userName,"MEETING_DETAILS",function(err,res){
						if (err) throw err;
						
						socket.userName = userName;
						
						//maintain the user details in the global array and set user role as participant
						authenticatedUsers[userName] = {'userName':userName,'id':socket.id,'role':'PARTICIPANT','status':'ONLINE','picture': picturePath,'isReconnected':false,'isDisconnected':false};
				
						if(res!='null' && res!='')
						{	
							var obj = JSON.parse(res);
							var currentRoomId = obj.roomId;
							if(currentRoomId!=null)
							{
								if(meetingRooms[currentRoomId]!=null)
								{
									authenticatedUsers[socket.userName].status = 'BUSY';
									initiateJoinRoom(currentRoomId);
								}
								else
								{
									socket.emit('loginVerifieduser');
								}
							}
						}
						else
						{  
							socket.emit('loginVerifieduser');
						}
						//update online user list
					     updateOnlineUsersList();
					});
					
					//update online user list
					updateOnlineUsersList();
					
				}
				// username & password mismatch
                else
                {
					socket.emit('loginFailed');
                }
            });
		});
		
		//for open user login
		//this method will be invoked while user enter into the session through URL
		socket.on("directlyEnterMeetingRoom",function(userName,passWord,roomId)
		{
			if(authenticatedUsers[userName]!=null)
			{
				socket.emit('duplicateUser',userName,passWord);
			}
			//user is not exist
			else
			{
				userdbConnection.query("SELECT * FROM user where user.user_name = '" + userName + "' AND user_password='"+passWord+"'", function(err, rows, fields)
				{	
					if(rows.length > 0)
					{
						var picturePath = rows[0].user_picture;
						MeetingManager.dataSubscribe(userName);
						socket.userName = userName;
						//maintain the user details in the global array and set user role as participant
						authenticatedUsers[userName] = {'userName':userName,'id':socket.id,'role':'PARTICIPANT','status':'ONLINE','picture': picturePath,'isReconnected':false,'isDisconnected':false};
						initiateJoinRoom(roomId);
						//update online user list
						setTimeout(function(){updateOnlineUsersList();},2000);
						dataStore.hmset(userName,"USER_DETAILS",JSON.stringify(authenticatedUsers[userName]));
					}
					else
					{
						socket.emit('loginFailed');
					}
				});
			}
		});		
	  
		//For update the current online user's details to all the connected clients
		/*function updateOnlineUsersList()
		{
			io.of(userNamespace).emit('displayOnlineUsersList',authenticatedUsers);
		}*/
		
		//For update the current online user's details to all the connected clients
		function updateOnlineUsersList()
		{
		    console.log('updateOnlineUsersList');
			io.of(userNamespace).emit('updateUsersList',authenticatedUsers);
		}
		
		//To reconnect the user
		socket.on('reConnection',function(userName,roomId)
		{
			var meetingMembers = null;
			clearTimeout(clearTimer);
			if(authenticatedUsers[userName]!=null && authenticatedUsers[userName].id != socket.id)
			{
	         	updateUserDetails(userName,true,'RECONNECT');
			 	// if room exists, restore the room details 
			 	if(roomId!=null)
				{
				   if(meetingRooms[roomId]!=null)
					{
						//for join into the new room
						joinRoom(roomId);
						//get the latest meeting member's details
						meetingMembers = updateMeetingMembersList(roomId);	
						if(authenticatedUsers[socket.userName]!=null)
						{
							authenticatedUsers[socket.userName].status = 'BUSY';
						}
						//To send the latest meeting member's details to all the meeting members
						io.of(userNamespace).in(roomId).emit('updateMeetingMembersList', meetingMembers);
					}	
					else
					{
						socket.emit('meetingEnded');
					}
					
				}
			}
			//to update user's list	
			updateOnlineUsersList();
	   });
	   
		//Update the profile picture in online users list by getting updating value from DB
		socket.on("updatePicture", function(userName)
		{
			if(userName!=null)
			{
				userdbConnection.query("SELECT user_picture FROM user where user_name = '" + userName + "'", function(err, rows, fields)
				{  
					if (err) throw err;
					var picturePath = rows[0].user_picture;
					//maintain the user details in the global array and set user role as participant
					authenticatedUsers[userName] = {'userName': userName, 'id': socket.id, 'role': 'PARTICIPANT', 'status': 'ONLINE','picture': picturePath};
					//update online user list
					updateOnlineUsersList();
				});
			}
		});
		
		//------------------------------------------Room-----------------------------------------------
		//For create a meeting room
		socket.on("createRoom",function(moderatorUserName,usersList,roomId)
		{
			//set user role as moderator and status as BUSY
			if(authenticatedUsers[socket.userName]!=null)
			{
				authenticatedUsers[moderatorUserName].status = 'BUSY';
				authenticatedUsers[moderatorUserName].role = 'MODERATOR';
			}
			authenticatedUsers[moderatorUserName] = {'userName':moderatorUserName,'id':socket.id,'picture': authenticatedUsers[moderatorUserName].picture};
			//for Moderator join into the meeting room 
			joinRoom(roomId);
		
			var meetingDetails ={'moderatorUserName':moderatorUserName,'roomId':roomId,'meetingStatus:':'STARTED'};
			MeetingManager.saveData("MEETING_LIST_"+socket.userName,JSON.stringify(meetingDetails));
			
			// create the JSON object
			jsonObject = JSON.stringify({'username':socket.userName,'roomid':roomId,'userslist':usersList
			});			 
			// prepare the header
			var postheaders = {
				'Content-Type' : 'application/json',
				'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
			};
			 
			// the post options
			var optionspost = {
				method : 'POST',
				headers : postheaders,
				host: 'localhost',
				port: 8090, 
                path: '/api/users/sendmeetinginvitation/'
			};
			
			// do the POST call
			var reqPost = http.request(optionspost, function(res) {
			    res.on('data', function(d) {
				});
			}).end(jsonObject);
	
		
			//Add the meetingroom details in the global array
			meetingRooms[roomId] = {'roomId':roomId,'moderatorUserName':moderatorUserName,'meetingMembers':usersList};
			MeetingManager.initSaveMeetingDetails(roomId,meetingRooms[roomId]);
			//get the meeting Member's details  	
			var meetingMembers = updateMeetingMembersList(roomId);	
			//For invoke the client side function for enter into the meeting room
			socket.emit('enterMeetingRoom',meetingMembers,moderatorUserName,roomId);
		});
	  
	    //for join into the meeting room
		function initiateJoinRoom(roomId)
		{
			//for join into the new room
			joinRoom(roomId);
			//get the latest meeting member's details
			var meetingMembers = updateMeetingMembersList(roomId);
			// for accepted user can enter into the meeting room
			var moderatorUserName = null;
			if(meetingRooms[roomId]!=null)
			{
				moderatorUserName =	meetingRooms[roomId].moderatorUserName;		
			}
			socket.emit('enterMeetingRoom',meetingMembers,moderatorUserName,roomId);
			if(authenticatedUsers[socket.userName]!=null)
			{
				authenticatedUsers[socket.userName].status = 'BUSY';
			}
			//broadcast the latest meeting member's details to all the meeting members
			socket.broadcast.to(roomId).emit('updateMeetingMembersList', meetingMembers);
			updateOnlineUsersList();
			authenticatedUsers[socket.userName].isReconnected = false;
		}
		
		//Join into the room and Assign roomId to the socket
		function joinRoom(roomId)
		{
			socket.join(roomId);
			socket.roomId = roomId;
		} 
		
		//It returns all the meeting member's details from current Meeting Room
		function updateMeetingMembersList(roomId)
		{
			var meetingMembers = {};
			var users =  io.of(userNamespace).clients(roomId);
				for(var i in users){		
					var userName = users[i].userName;
					var id = users[i].id;
					var roomId = users[i].roomId;
					meetingMembers[userName]={'moderatorUserName':meetingRooms[roomId].moderatorUserName,'id':id,'roomId':roomId};	
					//Save the meeting details of the user in back-end
					dataStore.hmset(userName,"MEETING_DETAILS",JSON.stringify(meetingMembers[userName]));
					}
			return meetingMembers;
		}
		
		//for update the User Details
		function updateUserDetails(userName,isReconnectedFlag,context)
		{       
		    socket.userName = userName;
			var oldUserId = authenticatedUsers[userName].id;
			var oldUserRole = authenticatedUsers[userName].role;
			var oldUserStatus = authenticatedUsers[userName].status;
			var picturePath;
            userdbConnection.query("SELECT user_picture FROM user where user_name = '" + userName + "'", function(err, rows, fields)
			{
				picturePath = rows[0].user_picture;
				if(context!='LOGIN')
				{
					// logout previous session
					if(io.of(userNamespace).sockets[oldUserId]!=null)
					{
						io.of(userNamespace).sockets[oldUserId].emit('logOutSession');
					}
				}
				//delete previous session details
				delete authenticatedUsers[userName];
				if(context=='LOGIN')
				{
					authenticatedUsers[userName] = {'userName':userName,'id':socket.id,'role':oldUserRole,'status':'ONLINE','isReconnected':isReconnectedFlag,'isDisconnected':false,'picture':picturePath};
				}
				else
				{
					authenticatedUsers[userName] = {'userName':userName,'id':socket.id,'role':oldUserRole,'status':oldUserStatus,'isReconnected':isReconnectedFlag,'isDisconnected':false,'picture':picturePath};
				}
				//Save the user details in back-end
				dataStore.hmset(userName,"USER_DETAILS",JSON.stringify(authenticatedUsers[userName]));
				updateOnlineUsersList();
			});
		}
		
		//To get the meeting rooms details
		socket.on('getMeetingRooms',function()
		{
			socket.emit('meetingRoomDetails',meetingRooms);
		});
	
		//For switching into the new Room 
		socket.on('switchRoom',function(newRoomId)
		{ 
			if(meetingRooms[socket.roomId]!=null)
			{
				var previous_RoomId = null;
				var previous_moderatorUserName = null;
			
				previous_RoomId = meetingRooms[socket.roomId].roomId;
				previous_moderatorUserName = meetingRooms[socket.roomId].moderatorUserName;
				
				//To exit from the previous room
				close(socket.userName,previous_RoomId,false);
				//To join the new room
				initiateJoinRoom(newRoomId);
			}
			else
			{
				console.log('Room not available for switching');
			}
		});
	  
		//This method will be invoked when Viewers click on accept invitation button 
		socket.on("acceptInvitation",function(roomId)
		{   
			initiateJoinRoom(roomId);
		});
	  
		//For exit from the meeting room
		socket.on('exitRoom',function(roomId)
		{ 
			close(socket.userName,roomId,false);		
		});
	 
		//------------------------------------------Logout, close and disconnect-----------------
		
		//For logout the user
		socket.on('logOutUser',function(roomId)
		{ 	
		    console.log('logOutUser'+socket.userName);
			close(socket.userName,roomId,true);
			//delete the duplicate user's details
			dataStore.del('DuplicateUser_'+socket.userName,function(err,res){
				if (err) throw err;
			});
		});
	
		//for exit and logOut from the meeting room
		function close(userName,roomId,isLogOut)
		{  
		    //if roomId is null, user is not in the meetingRoom
			if(roomId == null)
			{
			    //logOut from the session
				socket.emit('logOutSession');
				if(authenticatedUsers[userName]!=null)
				{
					//removed the logged out user details from the global array 
					delete authenticatedUsers[userName];
				}
				//update the current online user's details to all the clients
				updateOnlineUsersList();				  
			}
			else
			{
				var moderatorUserName = null;
				if(meetingRooms[roomId]!=null)
				{
					moderatorUserName =	meetingRooms[roomId].moderatorUserName;		
    			}
				//check whether exited user is moderator or not
				if(moderatorUserName==userName)
				{
	 			    //broadcast the exited message to the all clients.
					socket.broadcast.to(roomId).emit('meetingEnded');
					//get all the clients from the meetingRoom
					users = io.of(userNamespace).clients(roomId);
					var i=0;
					while(i<users.length){
					     //to leave all the clients from this room
						 users[i].leave(roomId);
						 removeMeetingDetails(users[i].userName,roomId);
						 i++;
					}
					//set the User's status as 'ONLINE' and role as 'PARTICIPANT'
					if(authenticatedUsers[socket.userName]!=null)
					{
						authenticatedUsers[socket.userName].status = 'ONLINE';
						authenticatedUsers[socket.userName].role = 'PARTICIPANT';
					}
					//if moderator will click on logout button,
					//removed the user information from the global array and exit from the current session 
					if(isLogOut==true) 
					{
						if(authenticatedUsers[userName]!=null)
						{
							delete authenticatedUsers[userName];
						}
					}
					socket.emit('exitMeetingRoom');
					//update online user's details
					updateOnlineUsersList();
				    delete meetingRooms[roomId];
				}
				else
				{   
				    //for meeting member
					//leave from current meeting room
					socket.leave(roomId);
					//if the meeting member is click on logout button ,
					//remove the user details from global array 
					if(isLogOut==true)
					{   
						if(authenticatedUsers[userName]!=null)
						{
							delete authenticatedUsers[userName];
							//for logOut from the session
							socket.emit('logOutSession');
						}
					}
					//else if one of the meeting member will click on exitRoom button	
					else 
					{
					    //for exit from the meetingRoom
						socket.emit('exitMeetingRoom');
						if(authenticatedUsers[socket.userName]!=null)
						{
							authenticatedUsers[socket.userName].status = 'ONLINE';
						}
					}
					//get the updated meeting member's details and broadcast it to all the meeting members
					var members = updateMeetingMembersList(roomId);
					io.of(userNamespace).in(roomId).emit('updateMeetingMembersList', members);
					//update current online users
					updateOnlineUsersList();
					
				}
			}
		}

		//disconnect the client
		socket.on('disconnect', function ()
		{
		    var tempRoomId = null;
			if(authenticatedUsers[socket.userName]!=null && authenticatedUsers[socket.userName].id == socket.id )
			{
				authenticatedUsers[socket.userName].isReconnected = false;
				authenticatedUsers[socket.userName].isDisconnected = true;
			}
			// Server waits for 180 seconds and then checks whether the user has failed to reconnect within this time
			// If the user couldn't get re-connected, we remove all the user details
			clearTimer=setTimeout(function(){
				if(authenticatedUsers[socket.userName]!=null)
				{
					if(authenticatedUsers[socket.userName].isReconnected == false && authenticatedUsers[socket.userName].id == socket.id )
					{
						close(socket.userName,tempRoomId,false);
						delete authenticatedUsers[socket.userName];
						dataStore.del(socket.userName,"MEETING_DETAILS",function(err,res){
							   if (err) throw err;
							});
						updateOnlineUsersList();
					}
				}
			},180000);
			tempRoomId = socket.roomId;
			console.log('User: '+userName);
			console.log('Userconnection disconnected'+socket.userName);
		});
	}
	
	// REST API call for login 
	/*
	*	Parameters	: username,password
	*	Method		: POST
	*/
	function login(req, res)
	{
	    var user_name = null;
		var password = null;
	   
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);
			userName = command.username;
			password = command.password;
			
			//Verifying username & password are not null
			if (userName != "" && password != "")
			{
				
				userdbConnection.query("select user.*,address.* from user,address where user.user_name='"+userName+"'and user.user_password='"+password+"'and user.user_id=address.user_id", function(err, rows, fields)
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
	
	//Getting user details by username
	function getUser(req, res)
	{
		var userName = req.params.username;
		userdbConnection.query("select user.*,address.* from user,address where user.user_name='"+userName+"'and user.user_id=address.user_id",function(err, rows, fields)
		{
			if (err)
				throw err;
			if (rows.length > 0)
			{ 
				 var values = {"result":rows[0]};
				 var data = JSON.stringify(values);
				 res.send(data);
			}
			else
			{
			    console.log('getuser else');
				var values = {"result":"NO_DATA_FOUND"};
				var data = JSON.stringify(values);
				res.send(data);
			}
		});
	}

	//Getting profile details by username
	function getProfileDetails(req,res)
	{
		var userName = req.params.username;
		userdbConnection.query("select user_id from user where user_name='"+userName+"'",function(err, rows, fields)
			{
			    if(err)
				{
				console.log('ERROR:'+err);
				}
				else if(rows.length > 0)
				{
					userdbConnection.query("select* from address where user_id='"+rows[0].user_id+"'",function(err, rows, fields){
					res.send(rows);
					});
				}
				else
				{
				   var status = 'no profile details found';
				   res.send(status);
				}
			});
	};

	//Getting Profile Option Type
	function getOptionType(req,res)
	{
		userdbConnection.query("select* from profile",function(err, rows, fields)
				{
					res.send(rows);
				});
	};

	//Getting Privacy Type
	function getPrivacytypeName(req,res)
	{
		userdbConnection.query("select* from privacy",function(err, rows, fields)
				{
					res.send(rows);
				});
	}

	// REST API method for updateUser by username
	/*
	*	Parameters	: username,fname,lname,description,email,organisation,mobile,address ,country
	*	Method		: PUT
	*/
	function updateUserByName(req, res)
	 {
		var userName = req.params.username;
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);
			userdbConnection.query("UPDATE USER SET user_fname='" + command.fname + "',user_lname='" + command.lname + "',user_email='" + command.email + "',user_organisation='" + command.organisation + "',user_phoneNumber='" + command.mobile + "',user_address='" + command.address + "',user_country='" + command.country + "',user_description='" + command.description + "' WHERE user_name='" + userName + "'",
				function(err, rows, fields)
				{
					var data = JSON.stringify({'message': 'Updated for' + ' ' + command.fname});
					res.send(data);
				}); 
		});
	};

	// REST API method for update oauth user data by id
	/*
	*	Parameters	: id,name,first_name,last_name,profile_picture
	*	Method		: PUT
	*/
	function updateOauthUserById(req, res)
	{
	 var id = req.params.id;
	 req.addListener('data', function(message)
		{
		    console.log('DATA ENTER'+id);
			var command = JSON.parse(message);
			var dataContent = command.data;
			var content = JSON.parse(dataContent);
			userdbConnection.query("UPDATE oauth_user SET user_name='" + content.name + "',user_first_name='" + content.first_name + "',user_last_name='" + content.last_name + "',user_profile_picture='" + content.picture + "' WHERE login_id='" + id + "'",
				function(err, rows, fields)
				{
				    if(err)
					{
						console.log(err);
						var data = JSON.stringify({'message': 'Error'});
						res.send(data);
					}
					else
					{
						var data = JSON.stringify({'message': 'Oauth Data Updated for ' + ' ' + content.name});
						res.send(data);
					}
				}); 
		});
	};
	
		
	// REST API method for add new user
	/*
	*	Parameters	: username,email,password
	*	Method		: POST
	*/
	function addNewUser(req, res)
	{
	    console.log('addNEW');
		req.addListener("data", function(message)
		{
		var command = JSON.parse(message);
			if(validateUserName(command.username)==true && validateEmail(command.emailofficial)==true && validatePassword(command.password)==true )
			{
				userdbConnection.query("INSERT INTO USER (user_name,user_password)VALUES('" + command.username + "','"+command.password+"')", function(err, rows, fields)
				{
				if (err)
				{
					var data = JSON.stringify({'message': 'ERROR_IN_INSERT'});
					console.log(err);
					res.send(data);
				}
				else
				{
					userdbConnection.query("INSERT INTO address (user_id,privacy_type_email,email,profile_type_email) VALUES ((SELECT u.user_id FROM USER u WHERE u.user_name ='" + command.username + "'),'1','"+command.emailofficial+"','1')", function(err, rows, fields)
					{
					if (err)
						{
							var data = JSON.stringify({'message': 'ERROR_IN_INSERT'});
							console.log(err);
						}
				
					});
					var data = JSON.stringify({'message': 'USER_ADDED'});
					res.send(data);
				}
				});
			}
			else
			{
				var data = JSON.stringify({'message': 'INSERT_DATA_NOTVALID'});
				res.send(data);
			}
		});
	};

	//Validating Email address for standard format
	function validateEmail(email) { 
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
	} 

	//Validating username 
	function validateUserName(userName) { 
    var re = /^[a-zA-Z0-9\-\.]+$/;
    return re.test(userName);
	} 

	//Validating password
	function validatePassword(password) { 

		if(password.length >=4) {
				return true;
			} else {
				return false;
			}
	} 

	//Validating mobile number
	function validateMobileNumber(mobilenumber) {
		if(mobilenumber.length >=10 && mobilenumber.length <=13) {
			var re = /^[0-9]+$/;
				return re.test(mobilenumber);
			} else {
				return false;
			}
	} 

	// REST API method for add oauth user
	/*
	*	Parameters	: login_id,user_email_address,user_name,user_first_name,user_last_name,user_profile_picture
	*	Method		: POST
	*/
	function addOauthNewUser(req, res)
	{
		req.addListener("data", function(message)
		{
		var command = JSON.parse(message);
		userdbConnection.query("INSERT INTO oauth_user (login_id,domain,user_email_address,user_name,user_first_name,user_last_name,user_profile_picture)VALUES('" + command.id + "','" + command.domain + "','"+command.email+"','"+command.name+"','"+command.first_name+"','"+command.last_name+"','"+command.picture+"')", function(err, rows, fields)
			{
				if (err)
				{
					var data = JSON.stringify({'message': 'ERROR_IN_OAUTH_INSERT'});
					console.log(err);
					res.send(data);
				}
				else
				{
					var data = JSON.stringify({'message': 'OAUTH_INSERT_SUCCESS'});
					res.send(data);
				}
			});
		});
	};
	
	// REST API method for checking username availability
	/*
	*	Parameters	: username
	*	Method		: GET
	*/
	function getUserAvailabilityStatus(req, res)
	{
		var name = req.params.username;
		userdbConnection.query("SELECT * FROM user where user_name = '" + name + "'", function(err, rows, fields)
			{
				if (err)
					throw err;				
				if (rows.length > 0)
				{
					res.send('false');
				}
				else
				{
					res.send('true');
				}
			});
	
	};
	
	// REST API method for get the user's details
	/*
	*	Parameters	: userid,username
	*	Method		: GET
	*   return	    : User's Details (JSON object)	
	*/
	function getUserByUserInfo(req, res)
	{
	    console.log('getUserByUserInfo');
		var parsedUrl = url.parse(req.url, true);
		var id = parsedUrl.query.userid;
		var name = parsedUrl.query.username;

		if (id != 'null' || name != 'null')
		{
			if (id != 'null')
			{
				userdbConnection.query("SELECT * FROM user where user_id = '" + id + "'", function(err, rows, fields)
				{
					if (err)
						throw err;
					//check whether the userid present or not	for getting user profile					
					if (rows.length > 0)
					{
						var data = JSON.stringify(rows[0]);
						res.send(data);
					}
					else
					{
						var data = JSON.stringify({'message': 'User not available'});
						res.send(data);
					}
				});
			}
			else if (name != 'null')
			{
				userdbConnection.query("SELECT * FROM user where user_name = '" + name + "'", function(err, rows, fields)
				{
					if (err)
						throw err;
					//check whether the userid present or not for getting user profile					
					if (rows.length > 0)
					{
						var data = JSON.stringify(rows[0]);
						res.send(data);
					}
					else
					{
						res.send('NO_DATA_FOUND');
					}
				});
			}
		}
	};

	// REST API method for get the all users details
	/*
	*	Parameters	: null
	*	Method		: GET
	*   return	    : All the Users Details (JSON object)	
	*/
	function getAllUsers(req, res)
	{
		userdbConnection.query("SELECT * FROM USER", function(err, rows, fields)
		{
			if (err)
				throw err;
			if (rows.length > 0)
			{
				var data = JSON.stringify(rows[0]);
				res.send(data);
			}
			else
			{
				res.send('NO_DATA_FOUND');
			}
		});
	};
	

	// REST API method for delete the user by userId
	/*
	*	Parameters	: userid
	*	Method		: Delete
	*   return	    : User Details (JSON object)	
	*/
	function deleteUserByUserId(req, res)
	{
		var id = req.params.userid;
		userdbConnection.query("DELETE FROM user where user_id = '" + id + "'", function(err, rows, fields)
		{
			if (err)
				throw err;
			if (err)
			{
				res.send('NO_DATA_FOUND');
			}
			else
			{
				res.send('DELETED');
			}
		});
	};

	// REST API method for search the user by starting letter
	/*
	*	Parameters	: username
	*	Method		: GET
	*   return	    : User Details (JSON object)	
	*/
	function searchUser(req, res)
	{
		var userName = req.params.username;
		userdbConnection.query("SELECT * FROM user WHERE user_name LIKE '" + userName + "%' ORDER BY user_name", function(err, rows, fields)
		{
			if (err)
            throw err;
			//Checking whether the user_name in DB starts with search string
			if (rows.length > 0)
			{
				var values = {"result":rows};
				var result =[];
				result.push(values);
				var data = JSON.stringify(result);
				res.send(data);
			}
			else
			{
				var values = {"result":"NO_DATA_FOUND"};
				var result =[];
				result.push(values);
				res.send(JSON.stringify(result));
			}
		});
	};

	//REST API Call for get the friends invitations
	/*
	*	Parameters	: username
	*	Method		: GET
	*   return	    : FRIEND INVITATIONS (JSON object)	
	*/
	function getFriendsInvitations(req, res)
	{
		var userName = req.params.username;
		dataStore.lrange('FRIEND_INVITATIONS_'+userName,0,-1, function(err,result){
		if (err) throw err;
			if(result !='' && result !=undefined)
				{
				    res.send(result);
				}
				else
				{
					res.send(result);
				}
			});
	};

	//REST API call,To get the all friends of the user
	/*
	*	Parameters	: username
	*	Method		: GET
	*   return	    : FriendList(JSON object)	
	*/
	function getFriendsList(req, res)
	{
		var userName = req.params.username;
		dataStore.lrange('FRIEND_'+userName,0,-1, function(err,result){
		if (err) throw err;
			if(result !='' && result !=undefined)
			{
				var values = {"result":result};
				var result =[];
				result.push(values);
				var data = JSON.stringify(result);
				res.send(data);
			}
			else
			{
				var values = {"result":"NO_DATA_FOUND"};
				var result =[];
				result.push(values);
				res.send(JSON.stringify(result));
			}
		});
	};

	//REST API call for send the friend request
	/*
	*	Parameters	: username,initiator
	*	Method		: POST
	*/
	function sendFriendRequest(req, res)
	{
		req.addListener('data', function(message)
		{
			var value = false;
			var command = JSON.parse(message);
			var userName = command.username;
			var initiator = command.initiator;
		    console.log('sendFriendRequest');
			//check the friendrequest already send or not
			// options for GET
			var optionsget = {
			host : 'localhost', 
			port : 8090,
			path : '/api/users/getfriendsinvitations/'+userName, 
			method : 'GET' 
			};
			// do the GET request
			var reqGet = http.request(optionsget, function(response) {
			response.on('data', function(value) {
			    var isExist = false;
				var command = JSON.parse(value);
				   if(command.result == "NO_DATA_FOUND")
					{
					    console.log('do the GET request If');
					    isExist = false;
					}
					else
					{
					    console.log('do the GET request Else');
						var userList = command;
						for(var index in userList)
						{
							if(userList[index]==initiator)
							{
								isExist = true;
								break;
							}
						}	
					}				
					if(!isExist)
					{
						var groupName = "FRIEND_REQUEST_BUS";
						var message = "SEND_FRIEND_REQUEST";	
						var obj = JSON.stringify({'message':message,'initiator':initiator,'member':userName,'receiver':userName});
						MeetingManager.dataPublish(groupName,obj);
						var data = {'message':'RECIVE_FRIEND_REQUEST','initiator':initiator,'member':userName};
						sendNotifiedEvent(userName,'MessageNotification',data);
						res.send({'result':'FRIEND_REQUEST_SENT'});
					}
					else
					{
						res.send({'result':'FRIEND_REQUEST_EXIST'});
					}
				});
			});
		
			reqGet.end();
			reqGet.on('error', function(e) {
			console.error('Error Here:'+e);
			});
		
		});
	};

	//REST API call for accept the friend request
	/*
	*	Parameters	: username,initiator
	*	Method		: POST
	*/
	function acceptFriendRequest(req, res)
	{
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);
			var userName = command.username;
			var initiator = command.initiator;

			//check the friendrequest  already accepted or not
			// options for GET
			var optionsget = {
			host : 'localhost', 
			port : 8090,
			path : '/api/users/getfriendlist/'+userName, 
			method : 'GET' 
			};

			// do the GET request
			var reqGet = http.request(optionsget, function(response) {
			response.on('data', function(value) {
			    var isExist = false;
				var command = JSON.parse(value);
				    if(command[0].result == "NO_DATA_FOUND")
					{
					  isExist = false;
					}
					else
					{
						var userList = command[0].result;
						for(var index in userList)
						{
							if(userList[index]==initiator)
							{
								isExist = true;
								break;
							}
						}	
						console.log('LIST: '+userList);
					}					
					if(!isExist)
					{
						var groupName = "FRIEND_REQUEST_BUS";
						var message = "ACCEPT_FRIEND_REQUEST";
						var obj = JSON.stringify({'message':message,'initiator':initiator,'member':userName,'receiver':initiator});
						MeetingManager.dataPublish(groupName,obj);
						MeetingManager.saveData('FRIEND_'+userName,initiator);
						MeetingManager.updateFriendsList(userName);
						MeetingManager.removeDataByKey('FRIEND_INVITATIONS_'+userName,initiator);
						res.send({'result':'FRIEND_REQUEST_ACCEPTED'});
					}
					else
					{
						res.send({'result':'FRIEND_REQUEST_ALREADY_ACCEPTED'});
					}
				});
			});

		reqGet.end();

		reqGet.on('error', function(e) {
		console.error('Here the error'+e);
		});
			
		});
		
	};
	
	//REST API call for reject the friend request
	/*
	*	Parameters	: username,initiator
	*	Method		: POST
	*/
	function rejectFriendRequest(req,res)
	{
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);			
			var userName = command.username;
			var initiator = command.initiator;
		
			MeetingManager.removeDataByKey('FRIEND_INVITATIONS_'+userName,initiator);		
			var message = "REJECT_FRIEND_REQUEST";
			var obj = JSON.stringify({'message':message,'initiator':initiator,'member':userName,'receiver':initiator});
			var groupName = "FRIEND_REQUEST_BUS";
			MeetingManager.dataPublish(groupName,obj);
			res.send({'result':'FRIEND_REQUEST_REJECTED'});
		});
	};
	
	//REST API call for get the meetings list
	/*
	*	Parameters	: username
	*	Method		: GET
	*   return	    : MeetingList(JSON object)	
	*/
	function getMeetingsByUserName(req, res)
	{
		var userName = req.params.username;
	
		dataStore.lrange('MEETING_LIST_'+userName,0,-1, function(err,result){
			if (err) throw err;
			if(result !='' && result !=undefined)
			{
				res.send(JSON.stringify(result));
			}
			else
			{
				res.send('NO_DATA_FOUND');
			}
		});	
	};
	
	//REST API call for to send a meeting invitation.
	/*
	*	Parameters	: userslist,username,roomid
	*	Method		: POST		
	*/
	function sendMeetingInvitation(req, res)
	{
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);			
			var usersList = command.userslist;
			var roomId = command.roomid;
			var userName = command.username;
			
			var moderatorUserName = null;
			if(meetingRooms[roomId]!=null)
			{
				moderatorUserName =	meetingRooms[roomId].moderatorUserName;		
			}
			for(var index in usersList)
			{
				var data ={'roomId':roomId,'moderatorUserName':moderatorUserName};
				sendNotifiedEvent(usersList[index].userName,'getInvitationByModerator',data);
				var meetingDetails ={'moderatorUserName':moderatorUserName,'roomId':roomId,'meetingStatus:':'STARTED'};
				MeetingManager.saveData("MEETING_LIST_"+usersList[index].userName,JSON.stringify(meetingDetails));			
			}
			res.send('SendMeetingInvitation Successfully done');
		});
	
	};

	//REST API call for to Reject the meeting invitation.
	/*
	*	Parameters	: moderatorusername,username
	*	Method		: POST		
	*/
	function rejectMeetingInvitation(req, res)
	{
		req.addListener('data', function(message)
		{	
			var command = JSON.parse(message);			
			var moderatorUserName = command.moderatorusername;
			var userName = command.username;
			var data ={'userName':username};
			sendNotifiedEvent(moderatorUserName,'rejectionMessage',data);
			res.send({'result':'rejectMeetingInvitation Successfully done'});
		});
	};
	
	//REST API Call for get the online users details
	/*
	*	Parameters	: username
	*	Method		: POST		
	*/
	function getOnlineUsersList(req,res)
	{
		var userName = req.params.username;
		var data = {'authenticatedUsers':authenticatedUsers};
		res.send(JSON.stringify(data));
	};
	
	//REST API Call for getting oauth user details
	/*
	*	Parameters	: id
	*	Method		: GET		
	*/
	function getOauthUsers(req,res)
	{
		var oauth_id = req.params.id;
		userdbConnection.query("SELECT * FROM oauth_user where login_id = '" + oauth_id + "'", function(err, rows, fields)
			{
				if (err)
					throw err;				
				if (rows.length > 0)
				{
					res.send(rows);
				}
				else
				{
					res.send('OAUTH_DATA_NOT_FOUND');
				}
			});
	};
	
	
	//REST API call for remove the friend from my friend list
	/*
	*	Parameters	: username,initiator
	*	Method		: POST
	*/
	function removeFriendContact(req,res)
	{
		req.addListener('data', function(message)
		{
			var command = JSON.parse(message);			
			var userName = command.username;
			var removedFriend = command.removedfriend;
			console.log('userName'+userName+'removedFriend'+removedFriend);
			MeetingManager.removeDataByKey('FRIEND_'+userName,removedFriend);
			MeetingManager.removeDataByKey('FRIEND_'+removedFriend,userName);	
			MeetingManager.updateFriendsList(userName);
			MeetingManager.updateFriendsList(removedFriend);			
			res.send({'result':'REMOVED_FRIEND_CONTACT'});
		});
	};
	
	//we can't directly communicate the clinet side method through REST API calls.so using this we can achive it.
	function sendNotifiedEvent(userName,remoteMethodName,data)
	{
	       // create the JSON object
			jsonObject = JSON.stringify({'userName':userName,'remoteMethodName':remoteMethodName,'data':data
			});
			 
			// prepare the header
			var postheaders = {
				'Content-Type' : 'application/json',
				'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
			};
			 
			// the post options
			var optionspost = {
				method : 'POST',
				headers : postheaders,
				host: 'localhost',
				port: 8090, 
                path: '/api/users/sendnotification/'
			};
			
			// do the POST call
			var reqPost = http.request(optionspost, function(res) {
			    res.on('data', function(d) {
				});
			}).end(jsonObject);
	
	};
	
	function removeMeetingDetails(userName,roomId)
	{
		// options for GET
			var optionsget = {
			host : 'localhost', 
			port : 8090,
			path : '/api/users/getmeetings/'+userName, 
			method : 'GET' 
			};
 
		// do the GET request
		var reqGet = http.request(optionsget, function(res) {
			res.on('data', function(result) {
				var meetingList = JSON.parse(result);
				var backupMeetingList = [];
				meetingList.forEach(
						function(element, index, array)
						{
							var meeting = JSON.parse(element);
							if(meetingRooms[meeting.roomId]==null)
							{
					           console.log('index'+index+'moderatorName'+meeting.moderatorUserName);		
							}
							else
							{
							    var backupMeetingDetails = {'moderatorUserName':meeting.moderatorUserName,'roomId':meeting.roomId,'meetingStatus:':meeting.meetingStatus}; 
								backupMeetingList.push(JSON.stringify(backupMeetingDetails));
							}
						}						
					);
							
					dataStore.del('MEETING_LIST_'+userName,function(err,res)
								{   
									if (err) throw err;
									console.log('result_value'+res);
								});
								
					if(backupMeetingList !=0)
						{	
							MeetingManager.saveData('MEETING_LIST_'+userName,backupMeetingList);
						}
				});
			});
		
		reqGet.end();
		
		reqGet.on('error', function(e) {
		console.error('Finally error here'+e);
		});
	};