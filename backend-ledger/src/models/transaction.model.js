const mongoose = require("mongoose")


const transactionSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: function () {
            return this.type !== "DEPOSIT"
        },
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: function () {
            return this.type !== "WITHDRAWAL"
        },
        index: true
    },
    initiatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: [ true, "Transaction must have an initiator" ],
        index: true
    },
    type: {
        type: String,
        enum: [ "TRANSFER", "DEPOSIT", "WITHDRAWAL" ],
        default: "TRANSFER",
        index: true
    },
    status: {
        type: String,
        enum: {
            values: [ "PENDING", "COMPLETED", "FAILED", "REVERSED", "PENDING_OTP" ],
            message: "Status can be either PENDING, COMPLETED, FAILED, REVERSED or PENDING_OTP",
        },
        default: "PENDING"
    },
    amount: {
        type: Number,
        required: [ true, "Amount is required for creating a transaction" ],
        min: [ 0, "Transaction amount cannot be negative" ]
    },
    note: {
        type: String,
        trim: true,
        maxlength: 240
    },
    flagged: {
        type: Boolean,
        default: false,
        index: true
    },
    flagReason: {
        type: String,
        trim: true,
        default: ""
    },
    source: {
        type: String,
        enum: [ "MANUAL", "SCHEDULED", "RECURRING", "SYSTEM" ],
        default: "MANUAL"
    },
    idempotencyKey: {
        type: String,
        required: [ true, "Idempotency Key is required for creating a transaction" ],
        index: true,
        unique: true
    }
}, {
    timestamps: true
})

const transactionModel = mongoose.model("transaction", transactionSchema)


module.exports = transactionModel   
