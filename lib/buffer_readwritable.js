
module.exports = BufferReadWritable;

var util = require("util");
var stream = require("stream");

function BufferReadWritable(buffer, options){
    
    options = options || {};
    
    options.decodeStrings = true;
    
    stream.Duplex.call(this, options);
    
    this._buffer = buffer;
    
    this._readOffset = 0;
    this._writeOffset = 0;
    
    this._continueRead = null;
    this._continueWrite = null;
    
    var bufferLength = buffer.length;
    
    this._eachInterval = function(x, add, callback){
        
        if(add === 0){
            return;
        }
        
        x = x % bufferLength;
        
        var overflow = Math.max(0, (x + add) - bufferLength);
        
        if(overflow > 0){
            callback.call(this, x, bufferLength);
            callback.call(this, 0, overflow);
        }
        else{
            callback.call(this, x, x + add);
        }
    };
}

util.inherits(BufferReadWritable, stream.Duplex);

BufferReadWritable.prototype.getBytesReadable = function(){
    return this._writeOffset - this._readOffset;
};

BufferReadWritable.prototype.getBytesWritable = function(){
    return this._buffer.length - this.getBytesReadable();
};

BufferReadWritable.prototype.getBytesRead = function(){
    return this._readOffset;
};

BufferReadWritable.prototype.getBytesWritten = function(){
    return this._writeOffset;
};

BufferReadWritable.prototype._read = function(n){
    
    var readable = this.getBytesReadable();
    
    var consume = Math.min(n || readable, readable);
        
    if(consume === 0){
        
        this._continueRead = function(){
            return BufferReadWritable.prototype._read.call(this, n);
        };
        
        return;
    }
    else{
        this._continueRead = null;
    }
    
    var commitOffset = this._readOffset;
    
    // The read offset must be updated before making push method calls because
    // of the possibility of re-entrant reads (discovered this behaviour while
    // testing MemorySocket). TODO write test case
    this._readOffset += consume;
    
    this._eachInterval(commitOffset, consume, function(start, end){
        var chunk = new Buffer(end - start);
        this._buffer.copy(chunk, 0, start, end);
        return this.push(chunk);
    });
    
    if(this._continueWrite !== null){
        this._continueWrite.call(this);
    }
};

BufferReadWritable.prototype._write = function(chunk, encoding, callback){
    
    var writeLength = Math.min(chunk.length, this.getBytesWritable());
    
    var partialWrite = writeLength < chunk.length;
    
    this._eachInterval(this._writeOffset, writeLength, function(start){
        chunk.copy(this._buffer, start, 0, writeLength);
    });
    
    this._writeOffset += writeLength;
    
    if(partialWrite){
        
        chunk = chunk.slice(writeLength);
        
        this._continueWrite = function(){
            BufferReadWritable.prototype._write.apply(this, [chunk, encoding, callback]);
        };
    }
    else{
        this._continueWrite = null;
        process.nextTick(callback);
    }
    
    if(this._continueRead !== null){
        this._continueRead.call(this);
    }
};
