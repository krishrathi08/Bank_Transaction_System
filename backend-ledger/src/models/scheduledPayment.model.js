const mongoose = require("mongoose")

const scheduledPaymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    note: {
        type: String,
        trim: true,
        maxlength: 240
    },
    frequency: {
        type: String,
        enum: [ "ONCE", "WEEKLY", "MONTHLY" ],
        default: "ONCE"
    },
    status: {
        type: String,
        enum: [ "ACTIVE", "PAUSED", "COMPLETED" ],
        default: "ACTIVE",
        index: true
    },
    nextRunAt: {
        type: Date,
        required: true,
        index: true
    },
    lastRunAt: {
        type: Date
    }
}, {
    timestamps: true
})

module.exports = mongoose.model("scheduledPayment", scheduledPaymentSchema)
