'use strict'

var log4js=require('log4js')
var http=require('http')
var https=require("https")
var fs=require('fs')

var socketIo=require('socket.io') 
var express=require('express')

var serveIndex=require('serve-index')

var USERCOUNT=3

log4js.configure({
    appenders:{
        file:{
            type:'file',
            filename:'app.log',
            layout:{
                type:'pattern',
                pattern:'%r %p - %m'
            }
        }
    },
    categories:{
        default:{
            appenders:['file'],
            level:'debug'
        }
    }
})

var logger = log4js.getLogger();

var app = express();
app.use(serveIndex('./public'))
app.use(express.static('./public'))

//设置跨域访问
app.all("*", function(req, res, next){
    //设置允许跨域的域名，*代表允许任意域名跨域
    res.header("Access-Control-Allow-Origin","*");

    //允许的header类型
    res.header("Access-Control-Allow-Headers", "content-type");
    
    //跨域允许的请求方式
    res.header("Access-Control-Allow-Methods", "DELETE,PUT,POST,GET,OPTIONS");
    if(req.method.toLowerCase()=='options'){
        res.send(200);
    }else{
        next();
    }
});

//HTTP服务
var http_server = http.createServer(app);
http_server.listen(80, '0.0.0.0');

var options ={
    key: fs.readFileSync('./cert/matrixlive.work.key'),
    cert: fs.readFileSync('./cert/matrixlive.work.pem')
}

var https_server = https.createServer(options, app);
var io = socketIo.listen(https_server);

//处理连接事件
io.sockets.on('connection', (socket)=>{
    //中转消息
    socket.on('message', (room,data)=>{
        logger.debug('message, room:'+room+", data, type:"+data.type);
        socket.to(room).emit('message', room, data);
    });

    //用户加入房间
    socket.on('join', (room)=>{
        socket.join(room);
        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)?Object.keys(myRoom.sockets).length:0;
        logger.debug('the user number of room (' + room+') is :'+users);

        //如果房间里人未满
        if(users<USERCOUNT){
            //发给除自己以外的房间的所有人
            socket.emit('joined', room, socket.id);

            //通知另一个用户，有人来了
            if(users>1){
                socket.to(room).emit('otherjoin', room, socket.id);
            }
        }else{//如果房间人满了
            socket.leave(room);
            socket.emit('full', room, socket.id);
        }
    });
    
    //用户离开房间
    socket.on('leave', (room)=>{
        //从管理
        socket.leave(room);

        var myRoom = io.sockets.adapter.rooms[room];
        var users = (myRoom)?Object.keys(myRoom.sockets).length:0;
        logger.debug('the user number of room is:' + users);

        socket.to(room).emit('bye', room, socket.id);

        socket.emit('leaved', room, socket.id);
    })
});

https_server.listen(443, '0.0.0.0');
