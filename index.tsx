//// Plugin originally written for Equicord at 2026-02-16 by https://github.com/Bluscream, https://antigravity.google
// region Imports
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import {
    ChannelStore,
    GuildChannelStore,
    MessageStore,
    React,
    showToast,
    Toasts,
    UserStore,
} from "@webpack/common";
import { Logger } from "@utils/Logger";

import { settings } from "./settings";
// endregion Imports

import { pluginInfo } from "./info";
export { pluginInfo };

// region Variables
const logger = new Logger(pluginInfo.id, pluginInfo.color);
const VoiceStateStore = findStoreLazy("VoiceStateStore");
let lastJoinedUserId: string | null = null;

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
    selfVideo: boolean;
    sessionId: string;
    suppress: boolean;
    requestToSpeakTimestamp: string | null;
}
// endregion Variables

// region Utils
function findFirstBotMessage(channelId: string): any {
    try {
        const messages = MessageStore.getMessages(channelId);
        if (!messages || !messages._array) return null;

        for (const message of messages._array) {
            if (message.author && message.author.id === settings.store.botId) {
                return message;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

function findBlockButton(message: any): any {
    try {
        if (!message.components || !Array.isArray(message.components)) {
            return null;
        }

        for (const component of message.components) {
            if (component.components && Array.isArray(component.components)) {
                for (const subComponent of component.components) {
                    if (subComponent.components && Array.isArray(subComponent.components)) {
                        for (const button of subComponent.components) {
                            if (button.customId === "block_button") {
                                return button;
                            }
                        }
                    }
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function simulateButtonClick(message: any, button: any) {
    try {
        const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
        if (!messageElement) {
            showToast("Could not find message element in DOM", Toasts.Type.FAILURE);
            return;
        }

        const buttonElement = messageElement.querySelector(`[data-custom-id="${button.customId}"]`) as HTMLButtonElement;
        if (!buttonElement) {
            showToast("Could not find button element in DOM", Toasts.Type.FAILURE);
            return;
        }

        buttonElement.click();
        showToast("Successfully triggered block action", Toasts.Type.SUCCESS);
    } catch (error) {
        showToast("Failed to block user - button click simulation failed", Toasts.Type.FAILURE);
    }
}

function handleVoiceStateUpdate(voiceStates: VoiceState[]) {
    if (!settings.store.enabled) return;

    const currentUserId = UserStore.getCurrentUser().id;

    for (const voiceState of voiceStates) {
        if (!voiceState.channelId || voiceState.oldChannelId === voiceState.channelId) continue;

        const channel = ChannelStore.getChannel(voiceState.channelId);
        if (!channel || channel.guild_id !== settings.store.targetServerId) continue;

        const allVoiceStates = VoiceStateStore.getAllVoiceStates();
        let myVoiceChannelId: string | null = null;

        for (const guildId of Object.keys(allVoiceStates)) {
            const guildVoiceStates = allVoiceStates[guildId];
            if (guildVoiceStates && guildVoiceStates[currentUserId]) {
                const myVoiceState = guildVoiceStates[currentUserId];
                myVoiceChannelId = myVoiceState?.channelId || null;
                break;
            }
        }

        if (!myVoiceChannelId || myVoiceChannelId !== voiceState.channelId) continue;
        if (voiceState.userId === currentUserId) continue;

        if (lastJoinedUserId === voiceState.userId) {
            showToast("Skipping duplicate user join (anti-flood protection)", Toasts.Type.MESSAGE);
            continue;
        }
        lastJoinedUserId = voiceState.userId;

        showToast("User joined your voice channel - triggering block action", Toasts.Type.MESSAGE);

        const voiceChannel = ChannelStore.getChannel(voiceState.channelId);
        if (!voiceChannel) {
            showToast("Could not find voice channel", Toasts.Type.FAILURE);
            continue;
        }

        let textChannel: any = null;
        const guildChannels = GuildChannelStore.getChannels(settings.store.targetServerId);
        if (guildChannels && guildChannels.TEXT) {
            textChannel = guildChannels.TEXT.find(
                ({ channel }) =>
                    channel.name === voiceChannel.name &&
                    channel.parent_id === voiceChannel.parent_id
            )?.channel;
        }

        const targetChannelId = textChannel ? textChannel.id : voiceChannel.id;

        const botMessage = findFirstBotMessage(targetChannelId);
        if (!botMessage) {
            showToast("Could not find bot message in channel", Toasts.Type.FAILURE);
            continue;
        }

        const blockButton = findBlockButton(botMessage);
        if (!blockButton) {
            showToast("Could not find block button in bot message", Toasts.Type.FAILURE);
            continue;
        }

        setTimeout(() => {
            simulateButtonClick(botMessage, blockButton);
        }, 1000);
        break;
    }
}
// endregion Utils

// region Definition
export default definePlugin({
    name: pluginInfo.name,
    description: pluginInfo.description,
    authors: pluginInfo.authors,
    settings,

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[] }) {
            handleVoiceStateUpdate(voiceStates);
        },
    },
});
// endregion Definition
