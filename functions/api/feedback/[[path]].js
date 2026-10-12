import { proxyCommunity } from "../../_shared/communityGateway.js";
export async function onRequest(context) { return proxyCommunity(context); }
