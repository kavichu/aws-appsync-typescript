import { PostConfirmationTriggerEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

export const postConfirmation = async (event: PostConfirmationTriggerEvent ) => {

  const createdAt = new Date().toJSON()
  const { userAttributes } = event.request

  const data = {
    id: userAttributes['sub'],
    email: userAttributes['email'],
    createdAt
  }

  const command = new PutCommand({
    TableName: process.env.USERS_TABLE,
    Item: data
  });

  await documentClient.send(command);

  return event
}