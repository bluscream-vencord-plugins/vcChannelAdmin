import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    targetServerId: {
        type: OptionType.STRING,
        description: "Server ID where the voice channel is located",
        default: "500074231544152074",
        restartNeeded: false,
    },
    botId: {
        type: OptionType.STRING,
        description: "Bot ID that sends the voice channel management message",
        default: "1279925176422633522",
        restartNeeded: false,
    },
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable automatic blocking when users join your voice channel",
        default: true,
        restartNeeded: false,
    },
});
