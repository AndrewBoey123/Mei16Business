const path = require('path');
const fs = require('fs/promises');

const BASE_PATH = path.resolve(__dirname,'..','..','userdata');
const WHATSAPP_PATH = path.join(BASE_PATH, 'whatsapp', 'session-MEI');
const MAPPING_FILE = path.join(BASE_PATH, 'json', 'mapping.json');
const CHAT_HISTORY = path.resolve(__dirname,'..','..','userdata','chathistory');

async function buildMapping() {
  const regex = /^lid-mapping-(\d+)\.json$/;

  let files = [];
  try {
    files = await fs.readdir(WHATSAPP_PATH);
  } catch {
    return [];
  }

  const matchedFiles = files.filter(f => regex.test(f));
  if (matchedFiles.length === 0) return await readMapping();

  // Read existing mapping
  let existing = await readMapping();

  // Index existing by phoneNumber (fast merge)
  const map = new Map();
  for (const item of existing) {
    if (item.phoneNumber && item.lid) {
      map.set(item.phoneNumber, item);
    }
  }

  // Read new files and merge
  for (const file of matchedFiles) {
    const phoneNumber = file.match(regex)[1];
    const filePath = path.join(WHATSAPP_PATH, file);

    let lid;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      lid = typeof parsed === 'string' ? parsed : parsed.lid;
    } catch {
      continue;
    }

    if (!lid) continue;

    // New data ALWAYS overrides old
    map.set(phoneNumber, { phoneNumber, lid });
  }

  const merged = Array.from(map.values());

  await fs.mkdir(path.dirname(MAPPING_FILE), { recursive: true });
  await fs.writeFile(MAPPING_FILE, JSON.stringify(merged, null, 2));

  return merged;
}

async function readMapping() {
  try {
    const data = await fs.readFile(MAPPING_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main(){
    await buildMapping()
    const data = await fs.readFile(MAPPING_FILE);
    const mapping = JSON.parse(data);

    const chathistoryFiles = await fs.readdir(CHAT_HISTORY);
    
    for(const file of chathistoryFiles){
        if(file.includes('.json')){
            const filePath = path.join(CHAT_HISTORY,file)
            const LID = file.replace('.json',"");
            const index = mapping.findIndex(LIDs => LIDs.lid === LID);

            if(index != -1){

                const phoneNum = mapping[index].phoneNumber;
                const data2 = await fs.readFile(filePath);
                const fileContent = JSON.parse(data2);

                const updatedContent = fileContent.map(user => {
                    return {
                        ...user, // Copy existing properties
                        user_phone: phoneNum // Overwrite user_name with LID
                    };
                });

                await fs.writeFile(filePath,JSON.stringify(updatedContent,null,2));
                await fs.rename(
                    path.join(CHAT_HISTORY, file), 
                    path.join(CHAT_HISTORY, `${phoneNum}.json`)
                );
            }
        }
    }

    console.log(mapping);
}

main();