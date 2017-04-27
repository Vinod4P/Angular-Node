var app = angular.module("myApp", ["ngRoute","restangular","ngSanitize"]);
app.config(function($routeProvider) {
    $routeProvider
    .when("/red", {
        templateUrl : "views/red.html",
		controller: "mainController"
    })
    .when("/green", {
        templateUrl : "views/green.html",
		controller: "mainController"
    })
    .when("/blue", {
        templateUrl : "views/blue.html",
		controller: "mainController"
    });
});

/*app.config(function(RestangularProvider) {
	
	var restprovider = RestangularProvider;
	restprovider.setBaseUrl("http://localhost:3000/");
			
$.get('config/config.xml',
	function(data) {
		//getting user module details
		$(data).find('user').each(function() {
			var restprovider = RestangularProvider;
			restprovider.setBaseUrl("http://"+serverDetails.user.ip+":"+serverDetails.user.port);
			}).error(function(XMLHttpRequest) {
			
			if (XMLHttpRequest.status == 0) {
				$.notifyBar({html: "Check Your Network.", close: true, closeOnClick: false});
			}
			else if (XMLHttpRequest.status == 404) {
				console.log('404');
				$.notifyBar({html: "Error on Loading server detail", close: true, closeOnClick: false});

			} else if (XMLHttpRequest.status == 500) {
				$.notifyBar({html: "Internel Server Error.", close: true, closeOnClick: false});
			} else {
				$.notifyBar({html: "Unknown Error.\n" + x.responseText, close: true, closeOnClick: false});
			}
		});
	});
});*/

app.controller('mainController', function($scope,$rootScope, socket, Restangular) {
  var socket = io.connect("http://localhost:8090/");
	$scope.currentCustomer = "vinod";
	$scope.showResponse = "";
	$scope.sendReq = function() {
		//socket.emit('message', $scope.currentCustomer);
		var data = {
						'username':$scope.currentCustomer,
						'password':$scope.currentCustomer
				};
		Restangular.all('api/users/login').post(JSON.stringify(data)).then(function(result) {
				if(result.message=="LOGIN_SUCCESS")
				{
					var user = result.data;
					$scope.showResponse = user.user_name;
					console.log(user.user_name);
					location.href = '#red';
				} else {
					console.log(result.message);
				}
			}, function error(reason) {
				console.log(reason);
			});
			
	};
	
	$scope.showAllUsers = function() {
		Restangular.all('api/users/all').getList().then(function(res) 
			{
				$scope.userData = res;
			}, function error(reason) {
			console.log(reason);
		});
	};
	
	
});