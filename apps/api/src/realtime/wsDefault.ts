interface LambdaResponse {
  statusCode: number;
  body?: string;
}

export const handler = async (): Promise<LambdaResponse> => {
  return {
    statusCode: 200,
    body: 'OK',
  };
};
