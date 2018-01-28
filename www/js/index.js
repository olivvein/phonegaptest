// (c) 2014 Don Coleman
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* global mainPage, deviceList, refreshButton */
/* global detailPage, resultDiv, messageInput, sendButton, disconnectButton */
/* global ble  */
/* jshint browser: true , devel: true*/
'use strict';

var requested = "";
var x = 0;

var canvas = document.getElementById("myCanvas");
var ctx = canvas.getContext("2d");

function onSuccess(position) {
    var element = document.getElementById('geolocation');
    element.innerHTML = 'Latitude: ' + position.coords.latitude + '<br />' +
        'Longitude: ' + position.coords.longitude + '<br />' +
        'Timestamp: ' + new Date(position.timestamp) + '<br />';
}

// onError Callback receives a [PositionError](../PositionError/positionError.html) object
//
function onErrorG(error) {
    alert('code: ' + error.code + '\n' +
        'message: ' + error.message + '\n');
}

var allDatas = "";
// ASCII only
function bytesToString(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
}

// ASCII only
function debugLog(string) {
    resultDiv.innerHTML = resultDiv.innerHTML + string + " <br/>";
};

function stringToBytes(string) {
    var array = new Uint8Array(string.length);
    for (var i = 0, l = string.length; i < l; i++) {
        array[i] = string.charCodeAt(i);
    }
    return array.buffer;
}

function create(text, name, type) {
    var dataButton = document.getElementById("saveDataButton");
    dataButton.href = 'data:attachment/text,' + encodeURI(text);
    dataButton.target = '_blank';
    dataButton.download = 'myFile.txt';
}

// this is Nordic's UART service
var bluefruit = {
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    txCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // transmit is from the phone's perspective
    rxCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // receive is from the phone's perspective
};

var dataBuffer = new Uint8Array(300000);
var lastIndex = 0;

function createFile(dirEntry, fileName, isAppend) {
    // Creates a new file or returns the file if it already exists.
    dirEntry.getFile(fileName, { create: true, exclusive: false }, function(fileEntry) {

        writeFile(fileEntry, null, isAppend);

    }, debugLog("File created done"));

}

function writeFile(fileEntry, dataObj) {
    // Create a FileWriter object for our FileEntry (log.txt).
    fileEntry.createWriter(function(fileWriter) {

        fileWriter.onwriteend = function() {
            //console.log("Successful file write...");
            resultDiv.innerHTML = resultDiv.innerHTML + "Successful file write...<br/>";
            readFile(fileEntry);
        };

        fileWriter.G = function(e) {
            //console.log("Failed file write: " + e.toString());
            resultDiv.innerHTML = resultDiv.innerHTML + "Failed file write: " + e.toString() + "<br/>";
        };

        // If data object is not passed in,
        // create a new Blob instead.
        if (!dataObj) {
            dataObj = new Blob([allDatas], { type: 'text/plain' });
        }
        allDatas = "";
        fileWriter.write(dataObj);
    });
};

function readFile(fileEntry) {

    fileEntry.file(function(file) {
        var reader = new FileReader();

        reader.onloadend = function() {
            //console.log("Successful file read: " + this.result);
            debugLog(fileEntry.fullPath + " as been written");
        };

        reader.readAsText(file);



    }, debugLog("read done"));
}

function myDecode(base62String) {
    var val = 0,
        i = 0,
        length = base62String.length,
        characterSet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    for (; i < length; i++) {
        val += characterSet.indexOf(base62String[i]) * Math.pow(62, length - i - 1);
    }

    return val;
};

var httpd = null;
var myBle = {};
myBle.data = 300000;
var myEvent;

var app = {


    initialize: function() {
        this.bindEvents();
        detailPage.hidden = true;
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        refreshButton.addEventListener('touchstart', this.refreshDeviceList, false);
        sendButton.addEventListener('click', this.askAllDatas, false);
        disconnectButton.addEventListener('click', this.disconnect, false);
        infoButton.addEventListener('click', this.askInfos, false);
        deviceList.addEventListener('touchstart', this.connect, false); // assume not scrolling
        commandButton.addEventListener('click', this.sendCommand, false);
        requestFsButton.addEventListener('click', this.requestAndroidFS, false);
    },
    onDeviceReady: function() {
        app.refreshDeviceList();
        console.log(cordova.file.applicationDirectory);
        navigator.geolocation.getCurrentPosition(onSuccess, onErrorG);
        webserver.onRequest(
            function(request) {
                console.log("O MA GAWD! This is the request: ", request);

                webserver.sendResponse(
                    request.requestId, {
                        status: 200,
                        body: '<html>Hello World</html>',
                        headers: {
                            'Content-Type': 'text/html'
                        }
                    }
                );
            }
        );

        webserver.start();

        //... after a long long time
        // stop the server

    },
    requestAndroidFS: function() {
        debugLog("Requesting File System");
        window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, function(dirEntry) {
            console.log('file system open: ' + dirEntry.name);
            var isAppend = true;
            createFile(dirEntry, "fileToAppend.txt", isAppend);
        }, debugLog("Fs done"));
    },

    refreshDeviceList: function() {
        deviceList.innerHTML = ''; // empties the list
        ble.scan([bluefruit.serviceUUID], 5, app.onDiscoverDevice, app.onError);
        navigator.geolocation.getCurrentPosition(onSuccess, onErrorG);

        // if Android can't find your device try scanning for all devices
        // ble.scan([], 5, app.onDiscoverDevice, app.onError);
    },
    onDiscoverDevice: function(device) {
        var listItem = document.createElement('li'),
            html = '<b>' + device.name + '</b><br/>' +
            'RSSI: ' + device.rssi + '&nbsp;|&nbsp;' +
            device.id;

        listItem.dataset.deviceId = device.id;
        listItem.innerHTML = html;
        listItem.class = "list-item list-item--tappable";
        deviceList.appendChild(listItem);
    },
    connect: function(e) {
        myEvent = e.target.dataset.deviceId;
        var deviceId = e.target.dataset.deviceId,
            onConnect = function(peripheral) {
                app.determineWriteType(peripheral);

                // subscribe for incoming data
                ble.startNotification(deviceId, bluefruit.serviceUUID, bluefruit.rxCharacteristic, app.onData, app.onError);
                sendButton.dataset.deviceId = deviceId;
                disconnectButton.dataset.deviceId = deviceId;
                resultDiv.innerHTML = "";
                app.showDetailPage();

            };

        ble.connect(deviceId, onConnect, app.onError);
    },
    determineWriteType: function(peripheral) {
        // Adafruit nRF8001 breakout uses WriteWithoutResponse for the TX characteristic
        // Newer Bluefruit devices use Write Request for the TX characteristic

        var characteristic = peripheral.characteristics.filter(function(element) {
            if (element.characteristic.toLowerCase() === bluefruit.txCharacteristic) {
                return element;
            }
        })[0];

        if (characteristic.properties.indexOf('WriteWithoutResponse') > -1) {
            app.writeWithoutResponse = true;
        } else {
            app.writeWithoutResponse = false;
        }

    },
    onData: function(data) { // data received from Arduino




        if (requested == "chart") {
            console.log("reveiving..");
            var temp = new Uint8Array(data);
            dataBuffer.set(temp, lastIndex);
            if (dataBuffer.indexOf(10) != -1) { //Si caractere de fin : #
                console.log("Write The Line");
                var stringArray = Array.prototype.slice.call(dataBuffer).map(String);
                stringArray.forEach(function(dd) {
                    if (String.fromCharCode(dd) != ",") {
                        x = x + 1;
                        if (x >= 200) {
                            x = 0;
                            ctx.beginPath();
                            ctx.rect(0, 0, 200, 100);
                            ctx.fillStyle = "white";
                            ctx.fill();
                        }


                        var ii = String.fromCharCode(dd);
                        console.log(ii);
                        ctx.moveTo(x, 100);
                        ctx.lineTo(x, ii);
                        ctx.stroke();
                    }
                });
                stringArray = [];
                dataBuffer = new Uint8Array(300000);
                lastIndex = 0;
            }
            progressVal.value = 100 * (lastIndex / myBle.data);
            lastIndex = temp.length + lastIndex;
        } else {
            var temp = new Uint8Array(data);
            dataBuffer.set(temp, lastIndex);
            if (dataBuffer.indexOf(35) != -1) { //Si caractere de fin : #
                debugLog("end of transmission de ouf");
                app.prepareData();
            }
            progressVal.value = 100 * (lastIndex / myBle.data);
            lastIndex = temp.length + lastIndex;

        }




    },
    prepareData: function(event) { // save data to text file
        //resultDiv.innerHTML = resultDiv.innerHTML + "Debut Prepare <br/>";
        resultDiv.scrollTop = resultDiv.scrollHeight;

        var stringArray = Array.prototype.slice.call(dataBuffer).map(String);
        var myData = "";
        stringArray.forEach(function(dd) {
            myData = myData + String.fromCharCode(dd);
            if (String.fromCharCode(dd) == "$") {
                if (messageInput.value != "Infos") {
                    myData = myData + "\n";
                }
            }
        });
        stringArray = [];
        dataBuffer = new Uint8Array(300000);
        lastIndex = 0;
        ligness.innerHTML = lastIndex;
        progressVal.value = 0;
        //resultDiv.innerHTML = resultDiv.innerHTML + "Fin <br/>";
        resultDiv.scrollTop = resultDiv.scrollHeight;

        if (requested == "infos") {
            var result = [];
            var infoss = myData.split('$');
            infoss.forEach(function(line) {
                if (line.indexOf("#") != -1) {} else {
                    var isStar = line.indexOf("*");
                    line = line.substring(isStar + 1);
                    var arr = line.split(',');

                    result.push(arr);
                }

            });
            result.forEach(function(ll) {
                debugLog(ll[0] + " is : " + ll[1]);
                if (ll[0] == "name") {
                    myBle.name = ll[1];
                    bleName.innerHTML = myBle.name;
                }
                if (ll[0] == "date") {
                    myBle.date = ll[1];
                }
                if (ll[0] == "time") {
                    myBle.time = ll[1];
                }
                if (ll[0] == "temp") {
                    myBle.temp = ll[1];
                }
                if (ll[0] == "voltage") {
                    myBle.voltage = ll[1];
                }
                if (ll[0] == "data") {
                    myBle.data = Number(ll[1]) * 8;
                }

            });
            resultDiv.scrollTop = resultDiv.scrollHeight;
        }
        if (requested == "sendAll") {
            var liness = myData.split("$");
            var result = [];
            liness.forEach(function(line) {
                if (line.indexOf("#") != -1) {} else {
                    var isStar = line.indexOf("*");
                    line = line.substring(isStar + 1);
                    var time = myDecode(line.substring(0, 4));
                    var gauche = myDecode(line.substring(4, 5));
                    var droite = myDecode(line.substring(5, 6));
                    var theArr = [];
                    theArr.push(time);
                    theArr.push(gauche);
                    theArr.push(droite);
                    result.push(theArr);
                }

            });
            allDatas = 'time,gauche,droite\n';
            result.forEach(function(rr) {
                if (rr[2] != undefined) {
                    allDatas = allDatas + rr[0] + ',' + rr[1] + ',' + rr[2] + '\n';
                } else {
                    console.log("Wrong data :");
                    console.log(rr);
                }
            });
            app.requestAndroidFS();
        }
        if (requested == "sendAll2") {
            console.log("Receiving compressed");
            var liness = myData.split("$$");
            var result = [];
            liness.forEach(function(line) {
                console.log(line);
                var dataType = line.split("$");
                var timeBig = dataType[0];
                var compressedData = dataType[1];
                var dLength = dataType[2];
                console.log("received length:" + dLength);
                console.log("")
                for (var jj = 0; jj < dLength; jj++) {
                    var mm = jj * 4;
                    myChunk = compressedData.substring(jj, jj + 4);
                    var isStar = myChunk.indexOf("*");
                    myChunk = myChunk.substring(isStar + 1);
                    myChunk = timeBig + myChunk;
                    var time = myDecode(myChunk.substring(0, 4));
                    var gauche = myDecode(myChunk.substring(4, 5));
                    var droite = myDecode(myChunk.substring(5, 6));
                    var theArr = [];
                    theArr.push(time);
                    theArr.push(gauche);
                    theArr.push(droite);
                    result.push(theArr);
                }
                if (line.indexOf("#") != -1) {} else {
                    var isStar = line.indexOf("*");
                    line = line.substring(isStar + 1);
                    var time = myDecode(line.substring(0, 4));
                    var gauche = myDecode(line.substring(4, 5));
                    var droite = myDecode(line.substring(5, 6));
                    var theArr = [];
                    theArr.push(time);
                    theArr.push(gauche);
                    theArr.push(droite);
                    result.push(theArr);
                }

            });
            allDatas = 'time,gauche,droite\n';
            result.forEach(function(rr) {
                if (rr[2] != undefined) {
                    allDatas = allDatas + rr[0] + ',' + rr[1] + ',' + rr[2] + '\n';
                } else {
                    console.log("Wrong data :");
                    console.log(rr);
                }
            });
            app.requestAndroidFS();
        }
        //resultDiv.innerHTML = resultDiv.innerHTML + "The data: <br/>";
        //resultDiv.innerHTML = resultDiv.innerHTML + myData;
        myData = "";



    },
    askInfos: function(event) {
        requested = "infos";
        console.log("Asking Infos...");
        var dataToSend = "*kD0%mspEl,infos$";
        app.sendData(dataToSend);
    },
    askAllDatas: function(event) {
        requested = "sendAll";
        console.log("Asking All Datas...");
        var dataToSend = "*kD0%mspEl,sendAll$";
        app.sendData(dataToSend);
    },
    sendCommand: function(event) {
        requested = 'sendAll2';
        var pp = messageInput.value.split(',');
        var dataToSend2 = '*kD0%mspEl';
        pp.forEach(function(arg) {
            dataToSend2 = dataToSend2 + ',' + arg;
        });
        dataToSend2 = dataToSend2 + '$';
        app.sendData(dataToSend2);
    },
    sendData: function(dataToSend) { // send data to Arduino
        console.log("Sending data :");
        var success = function() {
            console.log("success");
            resultDiv.innerHTML = resultDiv.innerHTML + "Sent: " + dataToSend + "<br/>";
            resultDiv.scrollTop = resultDiv.scrollHeight;
        };

        var failure = function() {
            console.log("Failed writing data to the bluefruit le");
        };
        var messagee = dataToSend;
        console.log(messagee);
        var deviceId = myEvent;



        if (messagee.length >= 18) {
            console.log("Message bigger than 18");
            var arraYofStringss = [];
            arraYofStringss = messagee.split(",");
            console.log(arraYofStringss);
            console.log(arraYofStringss.length);
            console.log(arraYofStringss[0]);
            var mleng = arraYofStringss.length;
            var ml = 0;

            for (var i = 0; i < mleng; i++) {
                var mm = arraYofStringss[i];
                if (i != mleng - 1) {
                    mm = mm + ',';
                }
                console.log("will send :");
                console.log(mm);
                var data = stringToBytes(mm);
                if (app.writeWithoutResponse) {
                    console.log("Write Without response ...");
                    ble.writeWithoutResponse(
                        deviceId,
                        bluefruit.serviceUUID,
                        bluefruit.txCharacteristic,
                        data, success, failure
                    );
                } else {
                    console.log("Write...");
                    ble.write(
                        deviceId,
                        bluefruit.serviceUUID,
                        bluefruit.txCharacteristic,
                        data, success, failure
                    );
                }
            };
        } else {
            console.log("message smaller than 16");
            var data = stringToBytes(messagee);
            if (app.writeWithoutResponse) {
                console.log("Write Without response ...");
                ble.writeWithoutResponse(
                    deviceId,
                    bluefruit.serviceUUID,
                    bluefruit.txCharacteristic,
                    data, success, failure
                );
            } else {
                console.log("Write...");
                ble.write(
                    deviceId,
                    bluefruit.serviceUUID,
                    bluefruit.txCharacteristic,
                    data, success, failure
                );
            }
        }



    },
    disconnect: function(event) {
        var deviceId = event.target.dataset.deviceId;
        ble.disconnect(deviceId, app.showMainPage, app.onError);
        webserver.stop();
    },
    showMainPage: function() {
        mainPage.hidden = false;
        detailPage.hidden = true;
    },
    showDetailPage: function() {
        mainPage.hidden = true;
        detailPage.hidden = false;
    },
    onError: function(reason) {
        alert("ERROR: " + JSON.stringify(reason)); // real apps should use notification.alert
    }
};