import filenamify from 'filenamify';

export default function handler(event, context) {
  return new Response(filenamify('foo/bar'), {
    headers: { 'content-type': 'text/plain' },
  });
}

export const config = {
    paths: "/api"
}