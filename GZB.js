"use strict";

var RecordItem = function(text){
    if (text) {
      var item = JSON.parse(text);

      this.id = item.id;//ID
      this.num = item.num;//编号
      this.payer = item.payer;//付款方
      this.receiveer = item.receiveer;//收款方
      this.from = item.from; //发起方 
      this.to = item.to; //目标方
      this.money = item.money; //总额
      this.nasNum = new BigNumber(item.nasNum); //NAS数量
      this.status = item.status;//状态 1：待收款方确认 2：待付款方支付 3：待收款方确认 4：已完结
      this.timestamp = item.timestamp;//记录的时间
      this.endtime = item.endtime;//到账日期
      this.tiaoshu = item.tiaoshu;//记录是该编号的第几条记录

    }else{
      this.id = "";
      this.num = "";
      this.payer = "";
      this.receiveer = "";
      this.from = "";
      this.to = "";
      this.money = "";
      this.nasNum =new BigNumber(0);
      this.status = "";
      this.timestamp = "";
      this.endtime = "";
      this.tiaoshu = "";
    }
};

RecordItem.prototype = {
    toString:function(){
      return JSON.stringify(this);
    }
};

var GZB = function(){
    LocalContractStorage.defineProperty(this,"size"); //自增ID
    LocalContractStorage.defineProperty(this,"pageNum");//单页数据条数
    LocalContractStorage.defineProperty(this,"number"); //记录编号
    LocalContractStorage.defineMapProperty(this,"RecordRepo",{
        parse:function(text){
          return new RecordItem(text);
        },
        stringify:function (o){
          return o.toString();
        }
    });
    LocalContractStorage.defineMapProperty(this,"userRepo");  //单一用户所有编号
    LocalContractStorage.defineMapProperty(this,"numberRepo");   //单一编号的所有记录
};

GZB.prototype = {
    init: function(){
        this.size = 0; //记录总条数
        this.number = 1; //账单编号
        this.pageNum =  5; //每页5条数据
    },
    //新增记录
    save: function (payer,receiveer,money,endtime){
        payer = payer.trim();
        if( !payer || payer === ""){
            throw new Error("请输入钱包地址");
        }
        var from = Blockchain.transaction.from;
        if (payer !== from) {
            throw new Error("您输入的钱包地址与发起交易的钱包地址不一致");
        }

        receiveer = receiveer.trim();
        if( !receiveer || receiveer === ""){
            throw new Error("请输入收款方钱包地址");
        }


        var id = this.size;;//ID
        var num = this.number;//编号

        var recordItem = new RecordItem();
        recordItem.id = id;//ID
        recordItem.num = num;//编号
        recordItem.payer = from;//付款方
        recordItem.receiveer = receiveer;//收款方
        recordItem.from = from; //发起方 
        recordItem.to = receiveer; //目标方
        recordItem.money = money; //总额
        recordItem.nasNum = new BigNumber(0);//NAS数量
        recordItem.status = 1;//状态 1：待收款方确认 2：待付款方支付 3：待收款方确认 4：已完结
        recordItem.timestamp = Date.parse(new Date());//记录的时间
        recordItem.endtime = endtime;//到账日期
        recordItem.tiaoshu = 1;//记录是该编号的第几条记录


        //将该记录存入RecordRepo表；
        this.RecordRepo.put(id,recordItem);  
        
        //存储num到num中的所有钱包地址下
        this._UserRepoAllSave(recordItem);

        
        //将该记录存入numberRepo表；
        this._NunberRepoSave(recordItem.id,recordItem.num);


        this.size ++;
        this.number ++;
     },
     //获取num账本的最新记录
     getNumNewRecord:function(num){
        var number = parseInt(num)||0;
        if (number === 0 || number >= this.number) {
            throw new Error("无效的记录编号");
        }
        var records = this.searchNum(number)||[];
        if (records.length <= 0) {
            throw new Error("交易编号错误");
        }
        var record = records[0]; //取num账单下的最新记录
        return record;
     },
     //编号查询
     searchNum:function(num){
        var number = parseInt(num)||0;
        if (number === 0 || number >= this.number) {
            throw new Error("无效的记录编号");
        }
        var arr = this.numberRepo.get(number)||[];
        var result = [];
        for (var i = arr.length - 1; i >= 0; i--) {
            var record = this.RecordRepo.get(arr[i]);
            result.push(record);
        }
        return result;
     },
     //账户查询
     searchAuthor:function(author,p){
        var page = parseInt(p);
        page = (page === 0 || !page) ? 1 : page;
        var maxPage = this.getAuthorTotalPage(author);//最大页数
        var result = [];
        if (maxPage === 0 ) {
            return result;
        }
        //超出页码则循环回到第一页
        page = (page > maxPage)?(page % maxPage) :page;
        page = (page === 0 || !page) ? 1 : page;
        //该账户的所有num号码
        var arr = this.userRepo.get(author)||[];
        //返回指定页记录
        var num = arr.length;
        var pageNum = this.pageNum;
        var star = num - pageNum * page;
        star = (star >0)?star:0;
        var end = num -1 -pageNum*(page -1);
        var list = [];
        for (var i = end; i >=star; i--) {
            var indexNum = arr[i]; //获取Num
            var record = this.getNumNewRecord(indexNum);//取num账单下的最新记录
           list.push(record);
        }
        return list;
     },
     //账户总页码
     getAuthorTotalPage:function(author){
        var arr = this.userRepo.get(author)||[];
        var maxPage =parseInt(arr.length / this.pageNum);
        maxPage  = (arr.length % this.pageNum === 0 ) ? maxPage: maxPage +1;
        return maxPage;
     },
     //获取总账单条数
     getAllNum:function(){
        return parseInt(this.number-1);
     },
     //确认生成记录 num为账单编号
     saveConfirmRecord:function(num){
        var number = parseInt(num);
        if (number === 0 || number >= this.number) {
            throw new Error("无效的记录编号");
        }

        var from = Blockchain.transaction.from; //交易发起方
        var record = this.getNumNewRecord(number); //获取num账单的最新记录
        var receiveer = record.receiveer || "";//获取该记录的接收方
        //权限确认
        if (from !== receiveer) {
            throw new Error("交易钱包地址与收款方钱包地址不一致");
        }
        //账单状态确认
        if (parseInt(record.status) !== 1) {
            throw new Error("状态错误");
        }
        //确认
        var id = this.size;;//ID

        var recordItem = new RecordItem();
        recordItem.id = id;//ID
        recordItem.num = record.num;//编号
        recordItem.payer = record.payer;//付款方
        recordItem.receiveer = record.receiveer;//收款方
        recordItem.from = from; //发起方 
        recordItem.to = record.to; //目标方
        recordItem.money = record.money; //总额
        recordItem.nasNum = new BigNumber(0);//NAS数量
        recordItem.status = 2;//状态 1：待收款方确认 2：待付款方支付 3：待收款方确认 4：已完结
        recordItem.timestamp =  Date.parse(new Date());//记录的时间
        recordItem.endtime = record.endtime;//到账日期
        recordItem.tiaoshu = parseInt(record.tiaoshu)+1;//记录是该编号的第几条记录


        //将该记录存入RecordRepo表；
        this.RecordRepo.put(id,recordItem);  
       
        //将该记录存入numberRepo表；
        this._NunberRepoSave(recordItem.id,recordItem.num);

        this.size ++; //总记录+1
     },
     //新增变更记录
     addChangeRecord:function(num,to){
        var number = parseInt(num);
        if (number === 0 || number >= this.number) {
            throw new Error("无效的记录编号");
        }
        var receiveer = to.trim() || "";
        if (!receiveer || receiveer === "") {
            throw new Error("新收款方地址为空");
        }
        var record = this.getNumNewRecord(num);//获取最新记录
        var from = Blockchain.transaction.from;//获取发起交易的钱包地址
        //权限确认
        if (from !== record.from) {
            throw new Error("交易钱包地址与原收款方钱包地址不一致");
        }
        //账单状态确认
        if (parseInt(record.status) !== 2 ) {
            throw new Error("状态错误");
        }
        //新增
        var id = this.size;//ID

        var recordItem = new RecordItem();
        recordItem.id = id;//ID
        recordItem.num = record.num;//编号
        recordItem.payer = record.payer;//付款方
        recordItem.receiveer = receiveer;//收款方
        recordItem.from = from; //发起方 
        recordItem.to = receiveer; //目标方
        recordItem.money = record.money; //总额
        recordItem.nasNum = new BigNumber(0);//NAS数量
        recordItem.status = 2;//状态 1：待收款方确认 2：待付款方支付 3：待收款方确认 4：已完结
        recordItem.timestamp =  Date.parse(new Date());//记录的时间
        recordItem.endtime = record.endtime;//到账日期
        recordItem.tiaoshu = parseInt(record.tiaoshu)+1;//记录是该编号的第几条记录


        //将该记录存入RecordRepo表；
        this.RecordRepo.put(id,recordItem);  

        //将num与userRepo表的用户关联；
        this._UserRepoAllSave(recordItem);
       
        //将该记录存入numberRepo表；
        this._NunberRepoSave(recordItem.id,recordItem.num);

        this.size ++; //总记录+1


     },
     //收款方支付
     Pay:function(num){
        var number = parseInt(num);
        if (number === 0 || number >= this.number) {
            throw new Error("无效的记录编号");
        }

        var record = this.getNumNewRecord(num);//获取最新记录
        var from = Blockchain.transaction.from;//获取发起交易的钱包地址
        var value = new BigNumber(Blockchain.transaction.value);

        //权限确认
        if (from !== record.payer) {
            throw new Error("交易钱包地址与付款方钱包地址不一致");
        }
        //账单状态确认
        if (parseInt(record.status) !== 2 ) {
            throw new Error("状态错误");
        }

        /******************************
               将金额转给收款者
        ******************************/
        Blockchain.transfer(record.receiveer,value);

        //新增
        var id = this.size;//ID

        var recordItem = new RecordItem();
        recordItem.id = id;//ID
        recordItem.num = record.num;//编号
        recordItem.payer = record.payer;//付款方
        recordItem.receiveer = record.receiveer;//收款方
        recordItem.from = from; //发起方 
        recordItem.to = record.receiveer; //目标方
        recordItem.money = record.money; //总额
        recordItem.nasNum = value;//NAS数量
        recordItem.status = 3;//状态 1：待收款方确认 2：待付款方支付 3：待收款方确认 4：已完结
        recordItem.timestamp =  Date.parse(new Date());//记录的时间
        recordItem.endtime = record.endtime;//到账日期
        recordItem.tiaoshu = parseInt(record.tiaoshu)+1;//记录是该编号的第几条记录


        //将该记录存入RecordRepo表；
        this.RecordRepo.put(id,recordItem);  

        //将num与userRepo表的用户关联；
        this._UserRepoAllSave(recordItem);
       
        //将该记录存入numberRepo表；
        this._NunberRepoSave(recordItem.id,recordItem.num);

        this.size ++; //总记录+1
     },
     //确认生成记录 num为账单编号
     payConfirmRecord:function(num){

        var number = parseInt(num);
        if (number === 0 || number >= this.number) {
            throw new Error("无效的记录编号");
        }

        var from = Blockchain.transaction.from; //交易发起方
        var record = this.getNumNewRecord(number); //获取num账单的最新记录
        var receiveer = record.receiveer || "";//获取该记录的接收方
        //权限确认
        if (from !== receiveer) {
            throw new Error("交易钱包地址与收款方钱包地址不一致");
        }
        //账单状态确认
        if (parseInt(record.status) !== 3) {
            throw new Error("状态错误");
        }
        //确认
        var id = this.size;;//ID

        var recordItem = new RecordItem();
        recordItem.id = id;//ID
        recordItem.num = record.num;//编号
        recordItem.payer = record.payer;//付款方
        recordItem.receiveer = record.receiveer;//收款方
        recordItem.from = from; //发起方 
        recordItem.to = record.to; //目标方
        recordItem.money = record.money; //总额
        recordItem.nasNum = record.nasNum;//NAS数量
        recordItem.status = 4;//状态 1：待收款方确认 2：待付款方支付 3：待收款方确认 4：已完结
        recordItem.timestamp =  Date.parse(new Date());//记录的时间
        recordItem.endtime = record.endtime;//到账日期
        recordItem.tiaoshu = parseInt(record.tiaoshu)+1;//记录是该编号的第几条记录


        //将该记录存入RecordRepo表；
        this.RecordRepo.put(id,recordItem);  
       
        //将该记录存入numberRepo表；
        this._NunberRepoSave(recordItem.id,recordItem.num);

        this.size ++; //总记录+1
     },

     //存储num到num中的所有钱包地址下
     _UserRepoAllSave:function(recordItem){
        this._UserRepoSave(recordItem.payer,recordItem.num); //付款方
        this._UserRepoSave(recordItem.receiveer,recordItem.num); //收款方
        this._UserRepoSave(recordItem.from,recordItem.num); //发起方
        this._UserRepoSave(recordItem.to,recordItem.num); //目标方 
     },
     //存储num到num中的某个钱包地址下
     _UserRepoSave:function(author,num){
        var userRecordNums = this.userRepo.get(author)||[]; //用数组装好该用户信息的所有num号
        //不存在该Num则添加
        if ( userRecordNums.indexOf(num) == -1) {
            userRecordNums.push(num)//添加num
        }
        this.userRepo.set(author,userRecordNums);
     },
     //存储id到Num编号下
     _NunberRepoSave:function(id,num){
        var nunberRepoIds = this.numberRepo.get(num)||[]; //用数组装好该用户信息的所有num号
        //不存在该Num则添加
        if ( nunberRepoIds.indexOf(id) == -1) {
            nunberRepoIds.push(id)//添加num
        }
        this.numberRepo.set(num,nunberRepoIds);
     },

     //获取总记录条数
     getRecordNum:function(){
        return parseInt(this.size);
     },

};
module.exports = GZB;
