import { AppSyncResolverEvent , AppSyncIdentityCognito} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ulid }  from 'ulid'

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

type InputArguments = {
  input: {
    text: String
  }
}

export const tweet = async (event: AppSyncResolverEvent<InputArguments> ) => {
  
  const id  = ulid()
  const createdAt = new Date().toJSON()
  const identity = event.identity as AppSyncIdentityCognito

  const data = {
    id,
    owner: identity.username,
    text: event.arguments.input.text,
    createdAt
  }
  const command = new PutCommand({
    TableName: process.env.TWEETS_TABLE,
    Item: data
  });

  await documentClient.send(command)

  return data
}