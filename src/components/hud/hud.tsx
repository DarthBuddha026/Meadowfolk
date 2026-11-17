'use client';

import { AnimatePresence } from 'framer-motion';
import { useSession } from '@/game/state/session-store';
import { InteractPrompt, MobileControls } from './controls';
import { Banners, BuildPalette, Chat, Hotbar } from './farm-hud';
import {
  AccountPanel,
  BagPanel,
  CoopPanel,
  CoopPlayPanel,
  HelpPanel,
  MorningPanel,
  PausePanel,
  ShipPanel,
  ShopPanel,
  StoragePanel,
  ThanksPanel,
} from './panels';
import { TopBar } from './top-bar';

/** In-play HUD layered over the 3D world. */
export function Hud() {
  const panel = useSession((s) => s.panel);
  const build = useSession((s) => s.build.on);

  return (
    <>
      {!build && <TopBar />}
      <Banners />
      <InteractPrompt />
      <Hotbar />
      <Chat />
      <MobileControls />
      <AnimatePresence>{build && <BuildPalette key="build" />}</AnimatePresence>
      <AnimatePresence>
        {panel === 'shop' && <ShopPanel key="shop" />}
        {panel === 'storage' && <StoragePanel key="storage" />}
        {panel === 'ship' && <ShipPanel key="ship" />}
        {panel === 'coop' && <CoopPanel key="coop" />}
        {panel === 'bag' && <BagPanel key="bag" />}
        {panel === 'coop-play' && <CoopPlayPanel key="coop-play" />}
        {panel === 'morning' && <MorningPanel key="morning" />}
        {panel === 'thanks' && <ThanksPanel key="thanks" />}
        {panel === 'account' && <AccountPanel key="account" />}
        {panel === 'help' && <HelpPanel key="help" />}
        {panel === 'pause' && <PausePanel key="pause" />}
      </AnimatePresence>
    </>
  );
}
