import express from 'express'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import { generateResponse } from '../controllers/generateResponse'

dotenv.config()

const app = express()
app.use(bodyParser.json())

app.post('/generate', generateResponse)

export default app
