const express = require("express");
const cors = require("cors");

const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccount.json");

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("BanDIT Backend funcionando");
});

app.post("/sendAlert", async (req, res) => {
    try {
        const { patientId } = req.body;
        const patientDoc = await db.collection("users").doc(patientId).get();
        if (!patientDoc.exists) {
            return res.status(404).json({ success: false, error: "Paciente no encontrado" });
        }
        const patientName = patientDoc.data().name ?? "El paciente";

        const caregiversSnap = await db
            .collection("users").doc(patientId)
            .collection("caregivers")
            .where("status", "==", "accepted")
            .get();

        if (caregiversSnap.empty) {
            return res.status(400).json({ success: false, error: "Paciente sin cuidadores vinculados" });
        }

        const caregiverIds = caregiversSnap.docs.map(d => d.id);
        const tokens = [];
        for (const caregiverId of caregiverIds) {
            const cgDoc = await db.collection("users").doc(caregiverId).get();
            const token = cgDoc.data()?.fcmToken;
            if (token) tokens.push(token);
        }

        if (tokens.length === 0) {
            return res.status(400).json({ success: false, error: "Ningún cuidador tiene token FCM" });
        }

        const response = await getMessaging().sendEachForMulticast({
            tokens,
            notification: {
                title: "🚨 Alerta BanDIT",
                body: `${patientName} necesita ayuda urgente`
            },
            data: { patientId, patientName, type: "CRISIS_ALERT" },
            android: {
                priority: "high",
                notification: { channelId: "bandit_alerts", sound: "default", priority: "max", visibility: "public" }
            }
        });

        await db.collection("users").doc(patientId).collection("alerts").add({
            type: "auto",
            triggeredAt: new Date(),
            resolvedAt: null,
            notifiedCaregivers: caregiverIds,
            successCount: response.successCount,
            failureCount: response.failureCount
        });

        console.log(`[BanDIT] Alerta enviada a ${response.successCount}/${tokens.length} cuidadores`);
        res.json({ success: true, successCount: response.successCount, failureCount: response.failureCount });

    } catch (error) {
        console.error("[BanDIT] Error en /sendAlert:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));