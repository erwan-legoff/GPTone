import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import { generateResponse } from '../controllers/generateResponse'
import morgan from 'morgan'
dotenv.config()

const app = express()
app.use(bodyParser.json())
app.use(morgan('dev'))


app.post('/generate', generateResponse)

export default app
