import dotenv from 'dotenv';
import connectDB from "./db/index.js";
import {app} from './app.js'

dotenv.config({
    path: './env'
})

connectDB()
.then(()=>{
    app.listen(process.env.PORT,()=>{
    console.log("surver is running on port",process.env.PORT); 
})
})
.catch((err)=>{
    console.log("mongo not connected", err)
})

