import { App } from '@octokit/app'
import { readFileSync } from 'node:fs'

let instance:App|undefined
export function githubApp(){
  if(instance)return instance
  const {GITHUB_APP_ID,GITHUB_PRIVATE_KEY,GITHUB_PRIVATE_KEY_PATH,GITHUB_WEBHOOK_SECRET,GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET}=process.env
  const privateKey=GITHUB_PRIVATE_KEY||(GITHUB_PRIVATE_KEY_PATH?readFileSync(GITHUB_PRIVATE_KEY_PATH,'utf8'):'')
  if(!GITHUB_APP_ID||!privateKey)throw new Error('GitHub App is not configured')
  instance=new App({appId:GITHUB_APP_ID,privateKey:privateKey.replace(/\\n/g,'\n'),webhooks:{secret:GITHUB_WEBHOOK_SECRET||'development'},oauth:GITHUB_CLIENT_ID&&GITHUB_CLIENT_SECRET?{clientId:GITHUB_CLIENT_ID,clientSecret:GITHUB_CLIENT_SECRET}:undefined})
  return instance
}

export const installationOctokit=(installationId:number)=>githubApp().getInstallationOctokit(installationId)
