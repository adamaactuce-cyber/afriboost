// Catalogue de prix côté serveur — COPIE de SVCS (index.html). À maintenir synchronisé.
// Régénérer : node scripts/extract-catalog.mjs
export const RESELLER_DISCOUNT = 10; // % — identique à index.html
export const CATALOG = {
 "tiktok": {
  "Followers": {
   "Followers Standard": {
    "rate": 4100,
    "min": 1000,
    "max": 100000
   },
   "Followers Premium": {
    "rate": 4900,
    "min": 1000,
    "max": 50000
   }
  },
  "Vues": {
   "Vues Standard": {
    "rate": 600,
    "min": 1000,
    "max": 50000000
   },
   "Vues Premium": {
    "rate": 700,
    "min": 1000,
    "max": 10000000
   }
  },
  "Likes": {
   "Likes Standard": {
    "rate": 700,
    "min": 100,
    "max": 50000
   },
   "Likes Premium": {
    "rate": 800,
    "min": 100,
    "max": 20000
   }
  },
  "Partages": {
   "Partages Standard": {
    "rate": 700,
    "min": 1000,
    "max": 50000
   }
  },
  "Likes LIVE": {
   "Likes Live Standard": {
    "rate": 700,
    "min": 1000,
    "max": 10000
   }
  },
  "Commentaires": {
   "Commentaires Personnalisés": {
    "rate": 900,
    "min": 10,
    "max": 5000
   }
  }
 },
 "instagram": {
  "Followers": {
   "Followers Standard": {
    "rate": 1900,
    "min": 1000,
    "max": 50000
   },
   "Followers Premium": {
    "rate": 2400,
    "min": 1000,
    "max": 20000
   }
  },
  "Likes": {
   "Likes Standard": {
    "rate": 700,
    "min": 1000,
    "max": 50000
   },
   "Likes Premium": {
    "rate": 800,
    "min": 1000,
    "max": 20000
   }
  },
  "Vues Reels": {
   "Vues Standard": {
    "rate": 600,
    "min": 1000,
    "max": 100000000
   },
   "Vues Premium": {
    "rate": 700,
    "min": 1000,
    "max": 50000000
   }
  },
  "Vues Stories": {
   "Vues Stories": {
    "rate": 700,
    "min": 1000,
    "max": 50000
   }
  },
  "Commentaires": {
   "Commentaires": {
    "rate": 900,
    "min": 10,
    "max": 2000
   }
  }
 },
 "facebook": {
  "Abonnés Page": {
   "Abonnés Standard": {
    "rate": 1600,
    "min": 1000,
    "max": 50000
   },
   "Abonnés Premium": {
    "rate": 1900,
    "min": 1000,
    "max": 20000
   }
  },
  "Abonnés Profil": {
   "Abonnés Profil": {
    "rate": 1600,
    "min": 1000,
    "max": 50000
   }
  },
  "Likes Publication": {
   "Likes Standard": {
    "rate": 800,
    "min": 1000,
    "max": 50000
   }
  },
  "Réactions": {
   "Réactions Standard": {
    "rate": 1000,
    "min": 1000,
    "max": 50000
   }
  },
  "Partages": {
   "Partages Standard": {
    "rate": 800,
    "min": 1000,
    "max": 20000
   }
  },
  "Vues Vidéo": {
   "Vues Standard": {
    "rate": 600,
    "min": 1000,
    "max": 100000
   }
  },
  "Avis (Note Google)": {
   "Avis Standard": {
    "rate": 1200,
    "min": 10,
    "max": 1000
   }
  },
  "Commentaires": {
   "Commentaires": {
    "rate": 500,
    "min": 10,
    "max": 5000
   }
  }
 },
 "telegram": {
  "Membres": {
   "Membres Standard": {
    "rate": 1900,
    "min": 1000,
    "max": 50000
   },
   "Membres Premium": {
    "rate": 2400,
    "min": 1000,
    "max": 20000
   }
  },
  "Vues": {
   "Vues Standard": {
    "rate": 600,
    "min": 1000,
    "max": 100000
   }
  }
 },
 "youtube": {
  "Abonnés": {
   "Abonnés Standard": {
    "rate": 27400,
    "min": 1000,
    "max": 10000
   }
  },
  "Vues": {
   "Vues Standard": {
    "rate": 1600,
    "min": 1000,
    "max": 100000
   },
   "Vues Premium": {
    "rate": 1900,
    "min": 1000,
    "max": 50000
   }
  },
  "Likes": {
   "Likes Standard": {
    "rate": 3400,
    "min": 1000,
    "max": 50000
   }
  },
  "Vues Shorts": {
   "Vues Shorts": {
    "rate": 1600,
    "min": 1000,
    "max": 100000
   }
  }
 },
 "whatsapp": {
  "Abonnés Canal": {
   "Abonnés Standard": {
    "rate": 3400,
    "min": 1000,
    "max": 50000
   }
  },
  "Réactions Emoji": {
   "Réactions Standard": {
    "rate": 1900,
    "min": 1000,
    "max": 50000
   }
  }
 },
 "twitter": {
  "Abonnés": {
   "Abonnés Standard": {
    "rate": 2900,
    "min": 1000,
    "max": 50000
   }
  },
  "Vues Tweet": {
   "Vues Standard": {
    "rate": 600,
    "min": 1000,
    "max": 100000
   }
  },
  "Likes Tweet": {
   "Likes Standard": {
    "rate": 700,
    "min": 1000,
    "max": 50000
   }
  }
 },
 "snapchat": {
  "Abonnés": {
   "Abonnés Standard": {
    "rate": 2400,
    "min": 1000,
    "max": 20000
   }
  },
  "Vues": {
   "Vues Standard": {
    "rate": 600,
    "min": 1000,
    "max": 50000
   }
  }
 }
};
