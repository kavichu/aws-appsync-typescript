import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ulid }  from 'ulid'

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

export const addTask = async (event, context) => {
  
  const id  = ulid()
  const createdAt = new Date().toJSON()
  const data = {
    id,
    owner: event.identity.username,
    text: event.arguments.input.text,
    createdAt
  }
  const command = new PutCommand({
    TableName: process.env.TASKS_TABLE,
    Item: data
  });

  const response = await documentClient.send(command);
  console.log(response)

  return data
}