import fetch from 'node-fetch';

export async function ding(text) {
    const api =
    "https://oapi.dingtalk.com/robot/send?access_token=c5ebab514ee53a5882f328660b224dceb347fc3dd17392bcc396c5a113d6a247";
    const payload = {
        msgtype: "text",
        text: {
            content: `other_${text}`,
        },
    };
    try {
        const response = await fetch(api, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        console.log("Ding Message sent: ", payload.text);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

// 如果要测试
// ding("test");