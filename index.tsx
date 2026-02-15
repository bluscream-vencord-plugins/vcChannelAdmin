export const pluginInfo = {
    id: "vcChannelAdmin",
    name: "VC Channel Admin",
    description: "Automatically blocks users when they join your voice channel by simulating button clicks on bot messages",
    color: "#7289da"
};

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import {
    ChannelStore,
    FluxDispatcher,
    GuildChannelStore,
    MessageStore,
    React,
    RestAPI,
    showToast,
    Toasts,
    UserStore,
} from "@webpack/common";

const VoiceStateStore = findStoreLazy("VoiceStateStore");

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

// Anti-flood protection
let lastJoinedUserId: string | null = null;

const settings = definePluginSettings({
    targetServerId: {
        type: OptionType.STRING,
        description: "Server ID where the voice channel is located",
        default: "500074231544152074",
    },
    botId: {
        type: OptionType.STRING,
        description: "Bot ID that sends the voice channel management message",
        default: "1279925176422633522",
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description:
            "Enable automatic blocking when users join your voice channel",
        default: true,
    },
});

function findFirstBotMessage(channelId: string): any {
    try {
        const messages = MessageStore.getMessages(channelId);
        if (!messages || !messages._array) return null;

        // Look for the first message from the bot
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

        // Search through all components for the block_button
        for (const component of message.components) {
            if (component.components && Array.isArray(component.components)) {
                for (const subComponent of component.components) {
                    if (
                        subComponent.components &&
                        Array.isArray(subComponent.components)
                    ) {
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

async function simulateButtonClick(
    message: any,
    button: any,
    channelId: string
) {
    try {
        // Try to find and click the button element in the DOM
        const messageElement = document.querySelector(
            `[data-message-id="${message.id}"]`
        );
        if (!messageElement) {
            showToast(
                "Could not find message element in DOM",
                Toasts.Type.FAILURE
            );
            return;
        }

        // Look for the button with the matching custom ID
        const buttonElement = messageElement.querySelector(
            `[data-custom-id="${button.customId}"]`
        ) as HTMLButtonElement;
        if (!buttonElement) {
            showToast(
                "Could not find button element in DOM",
                Toasts.Type.FAILURE
            );
            return;
        }

        // Simulate a click on the button
        buttonElement.click();

        showToast("Successfully triggered block action", Toasts.Type.SUCCESS);
    } catch (error) {
        showToast(
            "Failed to block user - button click simulation failed",
            Toasts.Type.FAILURE
        );
    }
}

function handleVoiceStateUpdate(voiceStates: VoiceState[]) {
    if (!settings.store.enabled) return;

    const currentUserId = UserStore.getCurrentUser().id;

    // Check if someone joined a voice channel in the target server
    for (const voiceState of voiceStates) {
        // Only process voice state changes where someone joined a channel
        if (
            !voiceState.channelId ||
            voiceState.oldChannelId === voiceState.channelId
        )
            continue;

        const channel = ChannelStore.getChannel(voiceState.channelId);
        if (!channel || channel.guild_id !== settings.store.targetServerId)
            continue;

        // Check if this user joined my voice channel
        const allVoiceStates = VoiceStateStore.getAllVoiceStates();
        let myVoiceChannelId: string | null = null;

        // Find my current voice channel
        for (const guildId of Object.keys(allVoiceStates)) {
            const guildVoiceStates = allVoiceStates[guildId];
            if (guildVoiceStates && guildVoiceStates[currentUserId]) {
                const myVoiceState = guildVoiceStates[currentUserId];
                myVoiceChannelId = myVoiceState?.channelId || null;
                break;
            }
        }

        if (!myVoiceChannelId || myVoiceChannelId !== voiceState.channelId)
            continue;

        // Skip if it's me joining
        if (voiceState.userId === currentUserId) continue;

        // Anti-flood protection
        if (lastJoinedUserId === voiceState.userId) {
            showToast(
                "Skipping duplicate user join (anti-flood protection)",
                Toasts.Type.MESSAGE
            );
            continue;
        }
        lastJoinedUserId = voiceState.userId;

        showToast(
            "User joined your voice channel - triggering block action",
            Toasts.Type.MESSAGE
        );

        // Find the voice channel's text chat
        // In Discord, voice channels typically have the same ID as their associated text channel
        // or we can look for a text channel with the same name
        const voiceChannel = ChannelStore.getChannel(voiceState.channelId);
        if (!voiceChannel) {
            showToast("Could not find voice channel", Toasts.Type.FAILURE);
            continue;
        }

        // Try to find the associated text channel
        // First try to find a text channel with the same name in the same category
        let textChannel: any = null;
        const guildChannels = GuildChannelStore.getChannels(
            settings.store.targetServerId
        );
        if (guildChannels && guildChannels.TEXT) {
            textChannel = guildChannels.TEXT.find(
                ({ channel }) =>
                    channel.name === voiceChannel.name &&
                    channel.parent_id === voiceChannel.parent_id
            )?.channel;
        }

        // If no text channel found, we'll use the voice channel ID directly
        // as some bots might send messages to the voice channel itself
        const targetChannelId = textChannel ? textChannel.id : voiceChannel.id;

        // Find the first message from the bot
        const botMessage = findFirstBotMessage(targetChannelId);
        if (!botMessage) {
            showToast(
                "Could not find bot message in channel",
                Toasts.Type.FAILURE
            );
            continue;
        }

        // Find the block button
        const blockButton = findBlockButton(botMessage);
        if (!blockButton) {
            showToast(
                "Could not find block button in bot message",
                Toasts.Type.FAILURE
            );
            continue;
        }

        // Add a small delay to ensure the message is loaded in the DOM
        setTimeout(() => {
            simulateButtonClick(botMessage, blockButton, targetChannelId);
        }, 1000);
        break;
    }
}

import { Logger } from "@utils/Logger";

const logger = new Logger(pluginInfo.name, pluginInfo.color);

export default definePlugin({
    name: "VC Channel Admin",
    description:
        "Automatically blocks users when they join your voice channel by simulating button clicks on bot messages",
    authors: [
        { name: "Bluscream", id: 467777925790564352n },
        { name: "Cursor.AI", id: 0n },
    ],

    settings,

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[] }) {
            handleVoiceStateUpdate(voiceStates);
        },
    },
});
