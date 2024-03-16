import { AppSyncResolverEvent , AppSyncIdentityCognito} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { PresignedPostOptions, createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";
import { ulid }  from 'ulid'
import * as path from 'path';
import { Conditions } from "@aws-sdk/s3-presigned-post/dist-types/types";

const s3Client = new S3Client({ region: "us-east-1" });
const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

type InputArguments = {
  input: {
    filename: string
    contentType: string
  }
}

export const getImageUploadUrl = async (event: AppSyncResolverEvent<InputArguments> ) => {
  
  const id  = ulid()
  const createdAt = new Date().toJSON()
  const identity = event.identity as AppSyncIdentityCognito

  const extension  = path.extname(event.arguments.input.filename)
  const Bucket = process.env.ASSETS_BUCKET || ""
  const Key = `uploaded-images/${id}${extension}`

  const conditions: Conditions[] = [
    ["starts-with", "$Content-Type", "image/"],
    ["content-length-range", 1024, 10485760],
  ]
  const Fields = {
    "Content-Type": event.arguments.input.contentType
  };
  const presignedPostOptions: PresignedPostOptions = {
    Bucket,
    Key,
    Conditions: conditions,
    Fields,
    Expires: 600
  }
  const { url, fields } = await createPresignedPost(s3Client, presignedPostOptions);

  const newFields = Object.keys(fields).map(fieldName => ({name: fieldName, value: fields[fieldName]}))

  const data = {
    id,
    owner: identity.username,
    url,
    fields: newFields,
    key: Key,
    status: "waiting_upload",
    createdAt
  }

  const command = new PutCommand({
    TableName: process.env.IMAGES_TABLE,
    Item: data
  });

  await documentClient.send(command)

  const result = {
    id,
    url,
    fields: newFields
  }

  return result
}