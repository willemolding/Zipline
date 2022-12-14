import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { config } from "@lodestar/config/default";
import { Api, getClient } from "@lodestar/api";
import {
  computeSyncPeriodAtSlot,
  getCurrentSlot,
} from "@lodestar/state-transition";
import { altair, ssz } from "@lodestar/types";
import { utils } from "ethers";

/// Params

const API_ENDPOINT = "https://lodestar-mainnet.chainsafe.io";

const INPUT_DIRECTORY = "../preimage-cache";

const EMULATOR_CMD = "cd ../cannon/mipsevm && go run main.go";

///

async function getPreviousSyncPeriod(api: Api): Promise<number> {
  const { data } = await api.beacon.getGenesis();
  return Math.max(
    computeSyncPeriodAtSlot(getCurrentSlot(config, data.genesisTime)) - 1,
    0
  );
}

function getEmulatorInput(update: altair.LightClientUpdate): {
  update: Uint8Array;
  updateHash: string;
} {
  const serialized = ssz.altair.LightClientUpdate.serialize(update);
  const hash = utils.keccak256(serialized).slice(2);
  return { update: serialized, updateHash: hash };
}

function shell(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
}

///

async function main(): Promise<void> {
  const api = getClient({ baseUrl: API_ENDPOINT }, { config });
  const previousPeriod = await getPreviousSyncPeriod(api);

  console.log(
    `fetching updates for periods ${previousPeriod} and ${previousPeriod + 1}`
  );

  const { data } = await api.lightclient.getUpdates(previousPeriod, 2);
  const inputs = data.map(getEmulatorInput);

  console.log(`previousPeriod hash: ${inputs[0].updateHash}`);

  console.log(`currentPeriod hash: ${inputs[1].updateHash}`);

  console.log(`writing emulator inputs to preimage-cache`);

  await Promise.all(
    inputs.map((input) =>
      writeFile(join(INPUT_DIRECTORY, "0x" + input.updateHash), input.update)
    )
  );

  // const shellCmdStr = `${EMULATOR_CMD} ${inputs
  //   .map((input) => input.updateHash)
  //   .join(" ")}`;
  // console.log(`calling emulator`, shellCmdStr);

  // const out = shell(shellCmdStr).split(" ");
}

main();
