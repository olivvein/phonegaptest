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
var lasty = 0;
var lastyk = 0;
var lastyl = 0;
var lastym = 0;
var canvas = document.getElementById("myCanvas");
var ctx = canvas.getContext("2d");
var modal = document.querySelector('ons-modal');
var posX;
var posY;
var httpd = null;
var buffLen = 10000;
var theMin = 999;
var theMax = 0;

var rangeMin = document.getElementById('zoomViewMin');
var rangeMax = document.getElementById('zoomViewMax');

function updateStatus() {
    document.getElementById('location').innerHTML = "document.location.href: " + document.location.href;
    if (httpd) {
        httpd.getURL(function(url) {
            if (url.length > 0) {
                document.getElementById('url').innerHTML = "server is up: <a href='" + url + "' target='_blank'>" + url + "</a>";
            } else {
                document.getElementById('url').innerHTML = "server is down.";
            }
        });
        httpd.getLocalPath(function(path) {
            document.getElementById('localpath').innerHTML = "<br/>localPath: " + path;
        });
    } else {
        console.log('CorHttpd plugin not available/ready.');
    }
}

function startServer(wwwroot) {
    if (httpd) {
        httpd.getURL(function(url) {
            if (url.length > 0) {
                document.getElementById('url').innerHTML = "server is up: <a href='" + url + "' target='_blank'>" + url + "</a>";
            } else {
                httpd.startServer({
                    'www_root': wwwroot,
                    'port': 8080
                }, function(url) {
                    //document.getElementById('url').innerHTML = "server is started: <a href='" + url + "' target='_blank'>" + url + "</a>";
                    updateStatus();
                }, function(error) {
                    document.getElementById('url').innerHTML = 'failed to start server: ' + error;
                });
            }

        }, function() {});
    } else {
        console.log('CorHttpd plugin not available/ready for start.');
    }
}

function stopServer() {
    if (httpd) {
        httpd.stopServer(function() {
            //document.getElementById('url').innerHTML = 'server is stopped.';
            updateStatus();
        }, function(error) {
            document.getElementById('url').innerHTML = 'failed to stop server' + error;
        });
    } else {
        console.log('CorHttpd plugin not available/ready.');
    }
}

function onSuccess(position) {
    posX = position.coords.latitude;
    posY = position.coords.longitude;
    var theTime = document.getElementById('theTime');
    theTime.innerHTML = new Date(position.timestamp).getHours() + ":" + new Date(position.timestamp).getMinutes() + ":" + new Date(position.timestamp).getSeconds();
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

var dataBuffer = new Uint8Array(buffLen);
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

var myBle = {};
myBle.data = buffLen;
myBle.right = 0;
myBle.left = 0;
var myEvent;

var app = {


    initialize: function() {
        this.bindEvents();
        detailPage.hidden = true;
        myCanvas.hidden = true;
        zoomView.hidden = true;
        app.showMainPage();
        window.plugins.insomnia.keepAwake();
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        refreshButton.addEventListener('touchstart', this.refreshDeviceList, false);
        sendButton.addEventListener('click', this.askAllDatas, false);
        disconnectButton.addEventListener('click', this.disconnect, false);
        infoButton.addEventListener('click', this.askInfos, false);
        deviceList.addEventListener('touchstart', this.connect, false); // assume not scrolling
        commandButton.addEventListener('click', this.sendCommand, false);
        graphButton.addEventListener('click', this.graphView, false);
        requestFsButton.addEventListener('click', this.requestAndroidFS, false);
    },
    onDeviceReady: function() {
        app.refreshDeviceList();
        console.log(cordova.file.applicationDirectory);
        setInterval(function() {
            navigator.geolocation.getCurrentPosition(onSuccess, onErrorG);
            //code goes here that will be run every 5 seconds.    
        }, 1000);

        httpd = (cordova && cordova.plugins && cordova.plugins.CorHttpd) ? cordova.plugins.CorHttpd : null;
        startServer("/");



        //... after a long long time
        // stop the server

    },
    requestAndroidFS: function() {
        debugLog("Requesting File System");
        window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, function(dirEntry) {
            console.log('file system open: ' + dirEntry.name);
            var isAppend = true;
            createFile(dirEntry, "fileToAppend2.txt", isAppend);
        }, debugLog("Fs done"));
    },

    refreshDeviceList: function() {
        deviceList.innerHTML = ''; // empties the list
        ble.scan([bluefruit.serviceUUID], 5, app.onDiscoverDevice, app.onError);


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

        //console.log(data);


        if (requested == "graph") {
            var temp = new Uint8Array(data);
            dataBuffer.set(temp, lastIndex);
            lastIndex = temp.length + lastIndex;
            if (dataBuffer.indexOf(10) != -1) { //Si caractere de fin : #
                var myDatas = "";
                //console.log("eol");
                //console.log(dataBuffer.length);
                if (dataBuffer.length < buffLen + 1) {
                    dataBuffer.forEach(function(tt) {
                        //console.log(tt);
                        if (tt != 0) {
                            myDatas = myDatas + String.fromCharCode(tt);
                        }
                    });
                    //console.log(myDatas);
                    var miDa = myDatas.split(",");
                    //console.log(miDa.length);
                    //console.log(miDa[2]);


                    //console.log(theMin + " - " + theMax);
                    rangeMin = document.getElementById('zoomViewMin');
                    rangeMax = document.getElementById('zoomViewMax');



                    var mapToNumber = function(x, in_min, in_max, out_min, out_max) {
                        return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
                    }

                    var formulaSimple = function(chiffre) {
                        return 200 - mapToNumber(Number(chiffre), 200 - rangeMin.value * 20, rangeMax.value * 20, 0, 200);
                        //return 200 - Number(chiffre) / 4;
                    }

                    //if (miDa.length == 5) {
                    x = x + 1;
                    if (x >= 350) {
                        x = 0;
                        ctx.beginPath();
                        ctx.rect(0, 0, 350, 200);
                        ctx.fillStyle = "white";
                        ctx.fill();
                    }
                    ctx.beginPath();
                    ctx.moveTo(x - 1, formulaSimple(lasty));
                    ctx.lineTo(x, formulaSimple(miDa[0]));
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = "#ff00ff";
                    ctx.stroke();
                    lasty = Number(miDa[0]);
                    //console.log(miDa[0] + "," + miDa[1] + "," + miDa[2] + "," + miDa[3]);


                    ctx.beginPath();
                    ctx.moveTo(x - 1, formulaSimple(lastyk));
                    ctx.lineTo(x, formulaSimple(miDa[1]));
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = "#00ff00";
                    ctx.stroke();
                    lastyk = Number(miDa[1]);





                    ctx.beginPath();
                    ctx.moveTo(x - 1, formulaSimple(lastyl));
                    ctx.lineTo(x, formulaSimple(miDa[2]));
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = "#0000ff";
                    ctx.stroke();
                    lastyl = Number(miDa[2]);


                    miDa[3] = miDa[3].substring(0, miDa[3].length - 2);

                    ctx.beginPath();
                    ctx.moveTo(x - 1, formulaSimple(lastym));
                    ctx.lineTo(x, formulaSimple(miDa[3]));
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = "#ff0000";
                    ctx.stroke();
                    lastym = Number(miDa[3]);
                    //}

                    //console.log(myDatas);
                    //console.log(Number(miDa[0]) + "," + Number(miDa[1]));

                }

                myDatas = "";
                dataBuffer = new Uint8Array(buffLen);
                lastIndex = 0;
            }

            //console.log(myData);


            /*
            var temp = new Uint8Array(data);
            dataBuffer.set(temp, lastIndex);
            if (dataBuffer.indexOf(10) != -1) { 
                var stringArray = Array.prototype.slice.call(dataBuffer).map(String);
                var myDatass = "";
                stringArray.forEach(function(tt) {
                    myDatass = myDatass + String.fromCharCode(tt);
                });

                var sss = myDatass.split(",");
                if (sss[0]) {
                    x = x + 1;
                    if (x >= 200) {
                        x = 0;
                        ctx.beginPath();
                        ctx.rect(0, 0, 200, 100);
                        ctx.fillStyle = "white";
                        ctx.fill();
                    }


                    var ii = sss[0];
                    ctx.moveTo(x, 100);
                    ctx.lineTo(x, ii);
                    ctx.stroke();
                }

                stringArray = [];
                dataBuffer = new Uint8Array();
                lastIndex = 0;
            }
            progressVal.value = 100 * (lastIndex / myBle.data);
            lastIndex = temp.length + lastIndex;
            */
        } else {
            var temp = new Uint8Array(data);
            dataBuffer.set(temp, lastIndex);
            if (dataBuffer.indexOf(35) != -1) { //Si caractere de fin : #
                debugLog("end of transmission de ouf");
                console.log("end of transmission de ouf");
                app.prepareData();
                lastIndex = 0;
            }
            if (requested != "infos") {
                var progressVal = document.getElementById("progressVal");
                progressVal.value = 100 * (lastIndex / myBle.data);
                var percent = document.getElementById("percent");
                percent.innerHTML = Math.round(100 * (lastIndex / myBle.data)) + "%";
            }




            if (lastIndex > buffLen) {
                console.log("too big" + lastIndex);
            }
            lastIndex = temp.length + lastIndex;


        }




    },
    prepareData: function(event) { // save data to text file
        resultDiv.innerHTML = resultDiv.innerHTML + "Debut Prepare <br/>";
        resultDiv.scrollTop = resultDiv.scrollHeight;
        console.log("Debut Prepare");

        var stringArray = Array.prototype.slice.call(dataBuffer).map(String);
        var myData = "";
        stringArray.forEach(function(dd) {
            myData = myData + String.fromCharCode(dd);
            if (requested == "sendAll2") {
                if (String.fromCharCode(dd) == "$$") {
                    if (messageInput.value != "Infos") {
                        myData = myData + "\n";
                    }
                }
            } else {
                if (String.fromCharCode(dd) == "$") {
                    if (messageInput.value != "Infos") {
                        myData = myData + "\n";
                    }
                }
            }

        });
        stringArray = [];
        dataBuffer = new Uint8Array(buffLen);
        lastIndex = 0;
        progressVal.value = 0;
        //resultDiv.innerHTML = resultDiv.innerHTML + "Fin <br/>";
        resultDiv.scrollTop = resultDiv.scrollHeight;

        if (requested == "infos") {
            var result = [];
            var infoss = myData.split('$');
            infoss.forEach(function(line) {
                if (line.indexOf("#") != -1) {} else {
                    var isStar = line.indexOf("*");
                    if (isStar != -1) {
                        line = line.substring(isStar + 1);
                    }
                    var arr = line.split(',');

                    result.push(arr);
                }

            });
            result.forEach(function(ll) {
                //console.log(ll);
                //debugLog(ll[0] + " is : " + ll[1]);
                debugLog(ll);
                if (ll[0] == "name") {
                    myBle.name = ll[1];
                    blePos.innerHTML = posX + " " + posY;
                    bleName.innerHTML = myBle.name;
                }
                if (ll[0] == "date") {
                    myBle.date = ll[1];
                }
                if (ll[0] == "time") {
                    myBle.time = ll[1];
                    var theTimeb = document.getElementById('theTimeb');
                    theTimeb.innerHTML = myBle.time;
                    console.log(myBle.time);
                }
                if (ll[0] == "temp") {
                    myBle.temp = ll[1];
                }
                if (ll[0] == "voltage") {
                    myBle.voltage = ll[1];
                }
                if (ll[0] == "scale") {
                    myBle.scale = ll[1];
                }
                if (ll[0] == "liveCount") {
                    myBle.liveCount = ll[1];
                }
                if (ll[0] == "hysteresis") {
                    myBle.hysteresis = ll[1];
                }
                if (ll[0] == "data") {
                    myBle.data = Number(ll[1]) * 8;
                }
                if (ll[0] == "liveLeftMove") {
                    myBle.left = myBle.left + Number(ll[1]);
                    var theTimeb = document.getElementById('theTimeb');
                    theTimeb.innerHTML = myBle.left + "|" + myBle.right;
                    console.log(myBle.left + "|" + myBle.right);
                    console.log(ll);
                }
                if (ll[0] == "liveRightMove") {
                    myBle.right = myBle.right + Number(ll[1]);
                    var theTimeb = document.getElementById('theTimeb');
                    theTimeb.innerHTML = myBle.left + "|" + myBle.right;
                    console.log(myBle.left + "|" + myBle.right);
                    console.log(ll);
                }

            });
            lastIndex = 0;
            buffLen = 10000;
            dataBuffer = new Uint8Array(buffLen);
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
            myData.replace("#", "");
            var liness = myData.split("$$");
            var result = [];
            liness.forEach(function(line) {
                //console.log(line);

                if (line.indexOf("#") != -1) {
                    console.log("End Of Transmission");
                } else {
                    //console.log(line);
                    var dataType = line.split("$");
                    var timeBig = dataType[0].substring(1);
                    var compressedData = dataType[1].substring(1);
                    var dLength = dataType[2].substring(1);
                    //console.log("received length:" + dLength);
                    //console.log("")

                    for (var jj = 0; jj < dLength; jj++) {

                        var mm = jj * 4;
                        var myChunk = compressedData.substring(jj, jj + 4);
                        //console.log(myChunk);
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
        modal.hide();



    },
    askInfos: function(event) {
        lastIndex = 0;
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = "infos";
        console.log("Asking Infos...");
        var dataToSend = "*kD0%mspEl,infos$";
        app.sendData(dataToSend);
        myCanvas.hidden = true;
        messageInput.hidden = false;
        resultDiv.hidden = false;
        zoomView.hidden = true;
        myBle.right = 0;
        myBle.left = 0;


    },
    askAllDatas: function(event) {
        buffLen = myBle.data * 8;
        dataBuffer = new Uint8Array(buffLen);
        modal.show();
        requested = "sendAll";
        console.log("Asking All Datas...");
        var dataToSend = "*kD0%mspEl,sendAll$";
        app.sendData(dataToSend);
    },
    graphView: function(event) {
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = "graph";
        messageInput.hidden = true;
        zoomView.hidden = false;
        resultDiv.hidden = true;
        console.log("Asking GRaph...");
        var dataToSend = "*kD0%mspEl,chart,1,30$";
        app.sendData(dataToSend);
        myCanvas.hidden = false;
    },
    sendCommand: function(event) {
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = 'infos';
        if (messageInput.value.indexOf("data") != -1) {
            buffLen = myBle.data * 8;
            dataBuffer = new Uint8Array(buffLen);
            modal.show();
            requested = 'sendAll2';
            myBle.left = 0;
            myBle.right = 0;

        }
        var pp = messageInput.value.split(',');
        var dataToSend2 = '*kD0%mspEl';
        pp.forEach(function(arg) {
            dataToSend2 = dataToSend2 + ',' + arg;
        });
        dataToSend2 = dataToSend2 + '$';
        console.log(requested);
        app.sendData(dataToSend2);
    },
    sendHyst: function(event) {
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = 'infos';
        var dataToSend2 = '*kD0%mspEl,hyst,12$';
        console.log(requested);
        app.sendData(dataToSend2);
    },
    sendHigh: function(event) {
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = 'infos';
        var dataToSend2 = '*kD0%mspEl,high,' + messageInput.value + '$';
        console.log(requested);
        app.sendData(dataToSend2);
    },
    sendLow: function(event) {
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = 'infos';
        var dataToSend2 = '*kD0%mspEl,low,' + messageInput.value + '$';
        console.log(requested);
        app.sendData(dataToSend2);
    },
    sendCount: function(event) {
        console.log("ask count");
        buffLen = 10000;
        dataBuffer = new Uint8Array(buffLen);
        requested = 'infos';
        var dataToSend2 = '*kD0%mspEl,liveCount,' + messageInput.value + '$';
        console.log(requested);
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
        var dataToSend = "*kD0%mspEl,chart,0$";
        app.sendData(dataToSend);
        var deviceId = event.target.dataset.deviceId;
        ble.disconnect(deviceId, app.showMainPage, app.onError);
        myCanvas.hidden = true;
        window.plugins.insomnia.allowSleepAgain();
    },
    showMainPage: function() {
        mainPage.hidden = false;
        detailPage.hidden = true;
        footerPage.hidden = true;
        console.log("Show main page");
    },
    showDetailPage: function() {
        mainPage.hidden = true;
        detailPage.hidden = false;
        footerPage.hidden = false;
    },
    onError: function(reason) {
        alert("ERROR: " + JSON.stringify(reason)); // real apps should use notification.alert
    }
};