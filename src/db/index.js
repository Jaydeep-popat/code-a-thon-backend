import mongoose from "mongoose";
import { DB_NAME } from "../constant.js";

const connectDB = async () => {
    const uri = process.env.MONGO_DB_URI;

    try {
        const connectInstanse =await mongoose.connect(`${process.env.MONGO_DB_URI}/${DB_NAME}`)
        console.log(`mongoDB connect!! DB Host: ${connectInstanse.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
}
export default connectDB;