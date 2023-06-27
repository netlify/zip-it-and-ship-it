import { add } from "./maths"

export function handler() {
  return {
    statusCode: 200,
    body: JSON.stringify(add(1, 2))
  }
}